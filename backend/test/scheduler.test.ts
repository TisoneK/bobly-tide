import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { GroupStore } from '../src/api/group.store';
import { SchedulerService } from '../src/api/scheduler.service';
import { fundGroupHolds } from '../src/domain/holds';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { PLATFORM_WALLET } from '../src/domain/types';
import { runMigrations } from '../src/db/migrate';
import { accountIdsForGroup, withLedger } from '../src/pg-settlement';
import { PgLedgerRepo } from '../src/repo/pg';
import { dueMaxHour, settleDueHours } from '../src/scheduler';

const pkg = DAILY_PACKAGE;
const HOUR_MS = 1000; // 1s "hours" so tests advance the clock cheaply
const T0 = new Date('2026-01-01T00:00:00.000Z');

async function setup() {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const repo = new PgLedgerRepo(pool);
  const store = new GroupStore(pool);
  await store.ensureDailyPackage(pkg);
  return { repo, store };
}

/** Create a full group, fund wallets + holds, and activate it at `startAt`. */
async function startedGroup(repo: PgLedgerRepo, store: GroupStore, startAt: Date) {
  const group = await store.createGroup();
  for (let i = 0; i < pkg.size; i++) await store.joinGroupAsNewUser(group.id, pkg);
  // Secure each member in join order (turn position = join order for the test).
  let loaded = await store.getGroup(group.id);
  for (const m of loaded.memberships) await store.setTurnPosition(m.id, m.joinOrder, T0);
  loaded = await store.getGroup(group.id);
  const walletIds = loaded.memberships.map((m) => m.walletId);

  await withLedger(repo, walletIds, (mem) => {
    for (const m of loaded.memberships) {
      mem.appendEntries([
        {
          id: randomUUID(),
          walletId: m.walletId,
          type: 'topup',
          amount: Money.of('24'),
          idempotencyKey: `topup:${m.id}`,
          createdAt: T0,
        },
      ]);
    }
  });
  await withLedger(repo, accountIdsForGroup(loaded.memberships), (mem) =>
    fundGroupHolds(pkg, loaded.memberships, mem),
  );
  await store.setState(group.id, 'active', startAt);
  return group.id;
}

describe('dueMaxHour', () => {
  it('yields hour 0 at start and caps at the last hour', () => {
    expect(dueMaxHour(T0, T0, 24, HOUR_MS)).toBe(0);
    expect(dueMaxHour(T0, new Date(T0.getTime() + 5 * HOUR_MS), 24, HOUR_MS)).toBe(5);
    expect(dueMaxHour(T0, new Date(T0.getTime() + 100 * HOUR_MS), 24, HOUR_MS)).toBe(23);
    expect(dueMaxHour(null, T0, 24, HOUR_MS)).toBe(-1);
  });
});

describe('settleDueHours', () => {
  it('settles a whole cycle once enough time has passed and completes the group', async () => {
    const { repo, store } = await setup();
    const id = await startedGroup(repo, store, T0);

    const loaded = await store.getGroup(id);
    const res = await settleDueHours(repo, store, loaded, pkg, new Date(T0.getTime() + 24 * HOUR_MS), HOUR_MS);

    expect(res.settled).toBe(24);
    expect(res.completed).toBe(true);
    expect((await store.getGroup(id)).group.state).toBe('completed');
    for (const m of loaded.memberships) {
      expect((await repo.balanceOf(m.walletId)).equals('22.8')).toBe(true);
    }
    expect((await repo.balanceOf(PLATFORM_WALLET)).equals('28.8')).toBe(true);
  });

  it('settles only the hours due so far', async () => {
    const { repo, store } = await setup();
    const id = await startedGroup(repo, store, T0);

    const loaded = await store.getGroup(id);
    const res = await settleDueHours(repo, store, loaded, pkg, new Date(T0.getTime() + 3 * HOUR_MS), HOUR_MS);

    expect(res.settled).toBe(4); // hours 0..3
    expect(res.completed).toBe(false);
    expect((await store.getGroup(id)).group.state).toBe('active');
  });
});

describe('SchedulerService.runDueTicks', () => {
  it('settles due hours across active groups and reports totals', async () => {
    const { repo, store } = await setup();
    await startedGroup(repo, store, T0);
    const sched = new SchedulerService(repo, store, pkg, { enabled: false, tickMs: 1, hourMs: HOUR_MS });

    const res = await sched.runDueTicks(new Date(T0.getTime() + 24 * HOUR_MS));
    expect(res.settled).toBe(24);
    expect(res.completed).toBe(1);

    // Nothing active left to settle.
    expect(await sched.runDueTicks(new Date(T0.getTime() + 48 * HOUR_MS))).toEqual({
      settled: 0,
      completed: 0,
    });
  });
});
