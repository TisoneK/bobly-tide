import { settleHour, type SettleDeps, type SettlementResult } from './domain/engine';
import { holdAccountId } from './domain/holds';
import { PLATFORM_WALLET, type Group, type Membership, type Package } from './domain/types';
import type { InMemoryLedgerRepo } from './repo/memory';
import type { PgLedgerRepo } from './repo/pg';

/**
 * Every ledger account one group's settlement touches: each member's wallet
 * and hold account, plus the platform account. This is the working set the
 * unit of work loads and the pure engine runs against.
 */
export function accountIdsForGroup(memberships: readonly Membership[]): string[] {
  const ids = new Set<string>([PLATFORM_WALLET]);
  for (const m of memberships) {
    ids.add(m.walletId);
    ids.add(holdAccountId(m.id));
  }
  return [...ids];
}

/**
 * Run a pure ledger operation on a Postgres-backed snapshot and persist its
 * result atomically.
 *
 * Loads the given accounts into an in-memory repo, runs `fn` (which may
 * append entries to that snapshot), then writes back only the entries `fn`
 * added — in one transaction, with the ledger's UNIQUE(idempotency_key) as
 * the concurrency backstop. This keeps the money engine pure and
 * synchronous while it runs on a real database.
 */
export async function withLedger<T>(
  repo: PgLedgerRepo,
  accountIds: readonly string[],
  fn: (snapshot: InMemoryLedgerRepo) => T,
): Promise<{ result: T; persisted: number }> {
  const snapshot = await repo.loadSnapshot(accountIds);
  const before = new Set(snapshot.allEntries().map((e) => e.idempotencyKey));

  const result = fn(snapshot);

  const added = snapshot.allEntries().filter((e) => !before.has(e.idempotencyKey));
  if (added.length > 0) await repo.appendEntries(added);
  return { result, persisted: added.length };
}

/**
 * Settle one hour of a group against Postgres (build spec §6, §14 step 1-2
 * on a real DB). Idempotent: a re-run finds the prior settlement in the
 * loaded snapshot and returns `already-settled` without writing.
 */
export async function settleHourOnPg(
  repo: PgLedgerRepo,
  group: Group,
  pkg: Package,
  memberships: readonly Membership[],
  hourIndex: number,
  deps: SettleDeps = {},
): Promise<SettlementResult> {
  const ids = accountIdsForGroup(memberships);
  const { result } = await withLedger(repo, ids, (snap) =>
    settleHour(group, pkg, memberships, hourIndex, snap, deps),
  );
  return result;
}
