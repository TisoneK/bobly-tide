import { randomUUID } from 'node:crypto';
import type { SettleDeps } from './engine';
import { releaseRemainingHold } from './holds';
import { Money } from './money';
import type { Membership } from './types';
import type { LedgerRepo } from '../repo/types';

export interface DefaultResult {
  membershipId: string;
  released: Money; // hold collateral returned to the wallet
  refunded: Money; // wallet balance returned to the member (minus what they owe)
}

export interface DefaultOptions extends SettleDeps {
  /** What the member still owes the group; subtracted from the refund. */
  owed?: Money;
}

/**
 * Process a member leaving the group mid-cycle — default (wallet + hold
 * exhausted) or a voluntary dropout (product spec §8.2, §8.3).
 *
 * Marks the membership defaulted, returns any locked collateral to the
 * wallet, and refunds the remaining wallet balance minus what the member
 * still owes. Their unreceived turn is forfeited automatically: once they
 * are no longer `active`, the engine never pays them in a later hour, and
 * a past payout already stands. The vacated slot must be refilled (see
 * {@link assignReplacement}) before the cycle can continue.
 */
export function processDefault(
  membership: Membership,
  repo: LedgerRepo,
  opts: DefaultOptions = {},
): DefaultResult {
  const idGen = opts.idGen ?? randomUUID;
  const clock = opts.clock ?? (() => new Date());
  const owed = opts.owed ?? Money.zero();

  membership.state = 'defaulted';

  // Hold collateral is the member's own money — return it to their wallet.
  const released = releaseRemainingHold(membership, repo, opts);

  // Refund whatever remains in the wallet, net of what they still owe.
  const walletBal = repo.balanceOf(membership.walletId);
  let refunded = walletBal.minus(owed);
  if (refunded.isNegative()) refunded = Money.zero();

  if (!refunded.isZero()) {
    const marker = `default:refund:${membership.id}`;
    if (!repo.hasEntryWithKey(marker)) {
      repo.appendEntries([
        {
          id: idGen(),
          walletId: membership.walletId,
          type: 'refund',
          amount: refunded.negated(), // leaves the system (paid back to the member)
          groupId: membership.groupId,
          idempotencyKey: marker,
          createdAt: clock(),
        },
      ]);
    }
  }

  return { membershipId: membership.id, released, refunded };
}

export class SlotNotVacantError extends Error {
  constructor(joinOrder: number) {
    super(`turn position ${joinOrder} still has an active member — cannot assign a replacement`);
    this.name = 'SlotNotVacantError';
  }
}

/**
 * Fill a vacated turn position from the package queue (product spec §8.3,
 * §8.4). The replacement inherits the position, so if the position's turn
 * hour has already passed the replacement simply keeps contributing and
 * never receives that payout (it was the departed member's, now forfeited);
 * if the turn is still ahead, the replacement will receive it.
 */
export function assignReplacement(
  memberships: Membership[],
  vacatedJoinOrder: number,
  incoming: Membership,
): Membership {
  const stillActive = memberships.some(
    (m) => m.joinOrder === vacatedJoinOrder && m.state === 'active',
  );
  if (stillActive) throw new SlotNotVacantError(vacatedJoinOrder);

  const replacement: Membership = { ...incoming, joinOrder: vacatedJoinOrder, state: 'active' };
  memberships.push(replacement);
  return replacement;
}
