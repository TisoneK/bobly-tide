import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { fundGroupHolds, holdAccountId, releaseRemainingHold } from '../src/domain/holds';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { PLATFORM_WALLET, type Membership } from '../src/domain/types';
import { runMigrations } from '../src/db/migrate';
import { accountIdsForGroup, settleHourOnPg, withLedger } from '../src/pg-settlement';
import { InMemoryLedgerRepo } from '../src/repo/memory';
import { PgLedgerRepo } from '../src/repo/pg';
import { DuplicateKeyError } from '../src/repo/types';
import { seedFullGroup } from '../src/seed';

const pkg = DAILY_PACKAGE;

/** A fresh in-process Postgres (pg-mem) — no Docker or server needed. */
function freshPool(): Pool {
  const db = newDb();
  const adapter = db.adapters.createPg();
  return new adapter.Pool() as unknown as Pool;
}

async function migratedRepo(): Promise<{ pool: Pool; repo: PgLedgerRepo }> {
  const pool = freshPool();
  await runMigrations(pool);
  return { pool, repo: new PgLedgerRepo(pool) };
}

function topup(accountId: string, amount: string, key: string) {
  return {
    id: randomUUID(),
    walletId: accountId,
    type: 'topup' as const,
    amount: Money.of(amount),
    idempotencyKey: key,
    createdAt: new Date(0),
  };
}

describe('migrations', () => {
  it('apply once and are idempotent', async () => {
    const pool = freshPool();
    expect(await runMigrations(pool)).toContain('0001_init');
    expect(await runMigrations(pool)).toEqual([]);
  });
});

describe('PgLedgerRepo', () => {
  it('appends entries and derives a balance', async () => {
    const { repo } = await migratedRepo();
    await repo.appendEntries([topup('acct-a', '10', 'k1'), topup('acct-a', '5.5', 'k2')]);

    expect((await repo.balanceOf('acct-a')).equals('15.5')).toBe(true);
    expect((await repo.balanceOf('acct-b')).equals('0')).toBe(true);
    expect(await repo.hasEntryWithKey('k1')).toBe(true);
    expect(await repo.hasEntryWithKey('nope')).toBe(false);
  });

  it('rejects a duplicate idempotency key and keeps the balance intact', async () => {
    const { repo } = await migratedRepo();
    await repo.appendEntries([topup('acct-a', '10', 'dup')]);

    await expect(repo.appendEntries([topup('acct-a', '99', 'dup')])).rejects.toBeInstanceOf(
      DuplicateKeyError,
    );
    expect((await repo.balanceOf('acct-a')).equals('10')).toBe(true);
  });
});

describe('the engine running on Postgres', () => {
  async function seedGroup(repo: PgLedgerRepo) {
    // Build the group structure only (no ledger writes), then persist topups
    // and holds through the Postgres unit of work.
    const { group, memberships } = seedFullGroup(pkg, new InMemoryLedgerRepo());
    const ids = accountIdsForGroup(memberships);
    await withLedger(repo, ids, (mem) => {
      for (const m of memberships) mem.appendEntries([topup(m.walletId, '24', `seed:${m.id}`)]);
      fundGroupHolds(pkg, memberships, mem);
    });
    return { group, memberships, ids };
  }

  async function systemTotal(repo: PgLedgerRepo, memberships: readonly Membership[]): Promise<Money> {
    let t = await repo.balanceOf(PLATFORM_WALLET);
    for (const m of memberships) {
      t = t.plus(await repo.balanceOf(m.walletId)).plus(await repo.balanceOf(holdAccountId(m.id)));
    }
    return t;
  }

  it('settles a full Daily cycle and lands correct balances in the database', async () => {
    const { repo } = await migratedRepo();
    const { group, memberships, ids } = await seedGroup(repo);

    expect((await systemTotal(repo, memberships)).equals('576')).toBe(true);

    for (let hour = 0; hour < pkg.size; hour++) {
      await settleHourOnPg(repo, group, pkg, memberships, hour);
      expect((await systemTotal(repo, memberships)).equals('576')).toBe(true);
    }

    // Return remaining collateral, then every balance comes from the DB.
    await withLedger(repo, ids, (mem) => {
      for (const m of memberships) releaseRemainingHold(m, mem);
    });
    for (const m of memberships) {
      expect((await repo.balanceOf(m.walletId)).equals('22.8')).toBe(true);
      expect((await repo.balanceOf(holdAccountId(m.id))).equals('0')).toBe(true);
    }
    expect((await repo.balanceOf(PLATFORM_WALLET)).equals('28.8')).toBe(true);
  });

  it('is idempotent: re-settling an hour writes nothing and changes no balance', async () => {
    const { repo } = await migratedRepo();
    const { group, memberships } = await seedGroup(repo);

    await settleHourOnPg(repo, group, pkg, memberships, 0);
    const holder = memberships.find((m) => m.joinOrder === 1)!;
    const after = await repo.balanceOf(holder.walletId);

    const again = await settleHourOnPg(repo, group, pkg, memberships, 0);
    expect(again.status).toBe('already-settled');
    expect((await repo.balanceOf(holder.walletId)).equals(after)).toBe(true);
  });
});
