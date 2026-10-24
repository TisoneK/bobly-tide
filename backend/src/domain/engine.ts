import { randomUUID } from 'node:crypto';
import { Money } from './money';
import {
  PLATFORM_WALLET,
  type Group,
  type LedgerEntry,
  type Membership,
  type MembershipId,
  type Package,
  type WalletId,
} from './types';
import type { LedgerRepo } from '../repo/types';

export interface SettleDeps {
  /** Injected for deterministic tests. */
  idGen?: () => string;
  clock?: () => Date;
}

export interface SettlementResult {
  status: 'settled' | 'already-settled';
  groupId: string;
  hourIndex: number;
  turnHolderId: MembershipId;
  pot: Money;
  fee: Money;
  payout: Money;
  entries: LedgerEntry[];
}

/** One member could not cover the hourly contribution. In the full system
 *  the security hold (product spec §8.1) covers this; that path is not yet
 *  built, so the engine refuses rather than produce a short pot. */
export class ShortfallError extends Error {
  constructor(
    public readonly short: ReadonlyArray<{
      membershipId: MembershipId;
      walletId: WalletId;
      balance: Money;
      needed: Money;
    }>,
  ) {
    super(`hourly settlement blocked: ${short.length} member(s) cannot cover the contribution`);
    this.name = 'ShortfallError';
  }
}

export class IncompleteGroupError extends Error {
  constructor(expected: number, active: number) {
    super(`group is not full: expected ${expected} active members, found ${active}`);
    this.name = 'IncompleteGroupError';
  }
}

export class InvalidHourError extends Error {
  constructor(hourIndex: number, size: number) {
    super(`hourIndex ${hourIndex} out of range for a ${size}-member cycle (0..${size - 1})`);
    this.name = 'InvalidHourError';
  }
}

function tickKey(groupId: string, hourIndex: number): string {
  return `tick:${groupId}:${hourIndex}`;
}

/**
 * Settle one hour of a group (build spec §6).
 *
 * For a full group of N members, this posts, atomically:
 *   - an `hourly_debit` of −contribution to every active member,
 *   - a `payout` of (pot − fee) to the member whose turn this hour is,
 *   - a `fee` of (pot × feePct) to the platform account.
 *
 * The three sets of entries net to zero, so no money is created or
 * destroyed. The whole settlement is keyed by (group, hour): calling it
 * again for the same hour is a no-op (`already-settled`), which is what
 * makes the hourly job safe to retry.
 */
export function settleHour(
  group: Group,
  pkg: Package,
  memberships: readonly Membership[],
  hourIndex: number,
  repo: LedgerRepo,
  deps: SettleDeps = {},
): SettlementResult {
  const idGen = deps.idGen ?? randomUUID;
  const clock = deps.clock ?? (() => new Date());
  const now = clock();

  if (!Number.isInteger(hourIndex) || hourIndex < 0 || hourIndex >= pkg.size) {
    throw new InvalidHourError(hourIndex, pkg.size);
  }

  const key = tickKey(group.id, hourIndex);
  const feeKey = `${key}:fee`;

  const pot = pkg.hourlyContribution.times(pkg.size);
  const fee = pot.times(pkg.feePct);
  const payout = pot.minus(fee);

  const active = memberships
    .filter((m) => m.groupId === group.id && m.state === 'active')
    .sort((a, b) => a.joinOrder - b.joinOrder);

  const turnHolder = active.find((m) => m.joinOrder === hourIndex + 1);
  // Idempotent short-circuit: if this hour was already settled, report it
  // without touching the ledger. (turnHolder is resolved first only for the
  // result shape; the real guard is the fee key.)
  if (repo.hasEntryWithKey(feeKey)) {
    return {
      status: 'already-settled',
      groupId: group.id,
      hourIndex,
      turnHolderId: turnHolder?.id ?? '',
      pot,
      fee,
      payout,
      entries: [],
    };
  }

  // Pilot happy path: the group must be full. Dropout/refill via the
  // security hold (product spec §8.3) is the next step, not this skeleton.
  if (active.length !== pkg.size) {
    throw new IncompleteGroupError(pkg.size, active.length);
  }
  if (!turnHolder) {
    throw new InvalidHourError(hourIndex, pkg.size);
  }

  // No member may be debited into the red. The hold would cover a shortfall
  // in the full system; here we refuse so the pot never comes up short.
  const short = active
    .map((m) => ({ m, balance: repo.balanceOf(m.walletId) }))
    .filter(({ balance }) => balance.lessThan(pkg.hourlyContribution))
    .map(({ m, balance }) => ({
      membershipId: m.id,
      walletId: m.walletId,
      balance,
      needed: pkg.hourlyContribution,
    }));
  if (short.length > 0) {
    throw new ShortfallError(short);
  }

  const entries: LedgerEntry[] = [];

  for (const m of active) {
    entries.push({
      id: idGen(),
      walletId: m.walletId,
      type: 'hourly_debit',
      amount: pkg.hourlyContribution.negated(),
      groupId: group.id,
      hourIndex,
      idempotencyKey: `${key}:debit:${m.id}`,
      createdAt: now,
    });
  }

  entries.push({
    id: idGen(),
    walletId: turnHolder.walletId,
    type: 'payout',
    amount: payout,
    groupId: group.id,
    hourIndex,
    idempotencyKey: `${key}:payout`,
    createdAt: now,
  });

  entries.push({
    id: idGen(),
    walletId: PLATFORM_WALLET,
    type: 'fee',
    amount: fee,
    groupId: group.id,
    hourIndex,
    idempotencyKey: feeKey,
    createdAt: now,
  });

  // Defensive: the hour must conserve money. If this ever fails, there is a
  // bug in the arithmetic above — never let it reach the ledger.
  const net = entries.reduce((acc, e) => acc.plus(e.amount), Money.zero());
  if (!net.isZero()) {
    throw new Error(`settlement does not conserve money (net ${net.toString()}) — refusing to post`);
  }

  repo.appendEntries(entries);

  return {
    status: 'settled',
    groupId: group.id,
    hourIndex,
    turnHolderId: turnHolder.id,
    pot,
    fee,
    payout,
    entries,
  };
}

/**
 * Run every hour of a group's cycle in order (hours 0..N-1) and mark the
 * group completed. Convenience for the demo and cycle tests; production
 * drives settleHour from the hourly scheduler, one hour at a time.
 */
export function settleCycle(
  group: Group,
  pkg: Package,
  memberships: readonly Membership[],
  repo: LedgerRepo,
  deps: SettleDeps = {},
): SettlementResult[] {
  const results: SettlementResult[] = [];
  for (let hour = 0; hour < pkg.size; hour++) {
    results.push(settleHour(group, pkg, memberships, hour, repo, deps));
  }
  group.state = 'completed';
  return results;
}
