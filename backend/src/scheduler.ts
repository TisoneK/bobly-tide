import { releaseRemainingHold } from './domain/holds';
import type { Package } from './domain/types';
import { accountIdsForGroup, settleHourOnPg, withLedger } from './pg-settlement';
import type { PgLedgerRepo } from './repo/pg';
import type { GroupStore, LoadedGroup } from './api/group.store';

export const ONE_HOUR_MS = 3_600_000;

/**
 * The highest hour index that is due for an active group at `now`, or -1 if
 * none. Hour 0 is due the moment the group starts; each `hourMs` of
 * wall-clock advances one hour, capped at the last hour of the cycle.
 */
export function dueMaxHour(
  startAt: Date | null,
  now: Date,
  size: number,
  hourMs: number = ONE_HOUR_MS,
): number {
  if (!startAt) return -1;
  const elapsed = now.getTime() - startAt.getTime();
  if (elapsed < 0) return -1;
  return Math.min(Math.floor(elapsed / hourMs), size - 1);
}

export interface SettleDueResult {
  settled: number;
  completed: boolean;
}

/**
 * Settle every hour that has come due for one active group (idempotently —
 * already-settled hours are no-ops). When the final hour settles, release
 * any remaining holds and mark the group completed.
 */
export async function settleDueHours(
  repo: PgLedgerRepo,
  store: GroupStore,
  loaded: LoadedGroup,
  pkg: Package,
  now: Date,
  hourMs: number = ONE_HOUR_MS,
): Promise<SettleDueResult> {
  if (loaded.group.state !== 'active') return { settled: 0, completed: false };

  const maxHour = dueMaxHour(loaded.startAt, now, pkg.size, hourMs);
  if (maxHour < 0) return { settled: 0, completed: false };

  let settled = 0;
  for (let hour = 0; hour <= maxHour; hour++) {
    const res = await settleHourOnPg(repo, loaded.group, pkg, loaded.memberships, hour);
    if (res.status === 'settled') settled++;
  }

  let completed = false;
  if (maxHour === pkg.size - 1) {
    await withLedger(repo, accountIdsForGroup(loaded.memberships), (mem) => {
      for (const m of loaded.memberships) releaseRemainingHold(m, mem);
    });
    await store.setState(loaded.group.id, 'completed');
    completed = true;
  }

  return { settled, completed };
}
