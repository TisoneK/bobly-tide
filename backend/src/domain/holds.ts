import { randomUUID } from 'node:crypto';
import { Money } from './money';
import type { LedgerEntry, Membership, Package } from './types';
import type { LedgerRepo } from '../repo/types';
import type { SettleDeps } from './engine';

// A member's security hold is modelled as a separate internal account that
// holds real money moved aside from their spendable wallet. Keeping it in
// its own account (rather than as negative entries on the wallet) preserves
// the invariant that a *wallet* balance is the member's spendable money,
// while the hold account balance is the member's locked collateral. The two
// together are the member's total money in the system.
export function holdAccountId(membershipId: string): string {
  return `hold:${membershipId}`;
}

export class InsufficientFundsForHoldError extends Error {
  constructor(
    public readonly membershipId: string,
    public readonly required: Money,
    public readonly available: Money,
  ) {
    super(
      `membership ${membershipId} cannot fund security hold: needs ${required.toString()}, has ${available.toString()}`,
    );
    this.name = 'InsufficientFundsForHoldError';
  }
}

/**
 * The security hold required of a member at turn position `joinOrder`
 * (product spec §8.1).
 *
 * The group's worst case is a member who collects their payout and then
 * stops paying. A member at position p (1-based) is paid in hour p−1 and
 * then still owes a contribution for each of the remaining (N − p) hours.
 * So the hold must cover `(N − p) × contribution`:
 *   - position 1 (paid first) owes the most afterwards → the largest hold;
 *   - position N (paid last) owes nothing afterwards → no hold.
 * The hold is released as those remaining hours are paid (§8.1).
 */
export function requiredHold(pkg: Package, joinOrder: number): Money {
  const remainingAfterTurn = pkg.size - joinOrder;
  if (remainingAfterTurn <= 0) return Money.zero();
  return pkg.hourlyContribution.times(remainingAfterTurn);
}

/** Current locked collateral available to a membership. */
export function holdAvailable(repo: LedgerRepo, membershipId: string): Money {
  return repo.balanceOf(holdAccountId(membershipId));
}

/**
 * Lock the required hold for a member by moving it from their spendable
 * wallet into their hold account. Idempotent per membership. Throws if the
 * wallet cannot cover the hold — a member must be funded before the group
 * starts (build spec §2.1, member journey step 4).
 */
export function fundHold(
  membership: Membership,
  pkg: Package,
  repo: LedgerRepo,
  deps: SettleDeps = {},
): Money {
  const idGen = deps.idGen ?? randomUUID;
  const clock = deps.clock ?? (() => new Date());
  if (membership.turnPosition == null) {
    throw new Error(`membership ${membership.id} has no turn position (not secured)`);
  }
  const required = requiredHold(pkg, membership.turnPosition);
  if (required.isZero()) return Money.zero();

  const marker = `hold:fund:${membership.id}`;
  if (repo.hasEntryWithKey(`${marker}:hold`)) return required; // already funded

  const spendable = repo.balanceOf(membership.walletId);
  if (spendable.lessThan(required)) {
    throw new InsufficientFundsForHoldError(membership.id, required, spendable);
  }

  const now = clock();
  const entries: LedgerEntry[] = [
    {
      id: idGen(),
      walletId: membership.walletId,
      type: 'hold',
      amount: required.negated(), // out of spendable
      groupId: membership.groupId,
      idempotencyKey: `${marker}:wallet`,
      createdAt: now,
    },
    {
      id: idGen(),
      walletId: holdAccountId(membership.id),
      type: 'hold',
      amount: required, // into locked collateral
      groupId: membership.groupId,
      idempotencyKey: `${marker}:hold`,
      createdAt: now,
    },
  ];
  repo.appendEntries(entries);
  return required;
}

/** Fund every member's hold for a group (call once when the group starts). */
export function fundGroupHolds(
  pkg: Package,
  memberships: readonly Membership[],
  repo: LedgerRepo,
  deps: SettleDeps = {},
): void {
  for (const m of memberships) {
    if (m.state === 'active') fundHold(m, pkg, repo, deps);
  }
}

/**
 * Move a membership's remaining locked collateral back to their spendable
 * wallet — used at cycle end and when a member leaves (product spec §8.3).
 * Idempotent per membership.
 */
export function releaseRemainingHold(
  membership: Membership,
  repo: LedgerRepo,
  deps: SettleDeps = {},
): Money {
  const idGen = deps.idGen ?? randomUUID;
  const clock = deps.clock ?? (() => new Date());
  const marker = `hold:release:${membership.id}`;
  if (repo.hasEntryWithKey(`${marker}:hold`)) return Money.zero(); // already released

  const locked = holdAvailable(repo, membership.id);
  if (locked.isZero()) return Money.zero();

  const now = clock();
  repo.appendEntries([
    {
      id: idGen(),
      walletId: membership.walletId,
      type: 'hold_release',
      amount: locked, // back into spendable
      groupId: membership.groupId,
      idempotencyKey: `${marker}:wallet`,
      createdAt: now,
    },
    {
      id: idGen(),
      walletId: holdAccountId(membership.id),
      type: 'hold_release',
      amount: locked.negated(), // out of locked
      groupId: membership.groupId,
      idempotencyKey: `${marker}:hold`,
      createdAt: now,
    },
  ]);
  return locked;
}
