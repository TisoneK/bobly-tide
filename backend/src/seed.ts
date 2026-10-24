import { randomUUID } from 'node:crypto';
import type { Money } from './domain/money';
import type { Group, Membership, Package } from './domain/types';
import type { LedgerRepo } from './repo/types';

export interface SeededGroup {
  group: Group;
  memberships: Membership[];
}

export interface SeedOptions {
  /** If set, each member's wallet is topped up by this amount. */
  topUpEach?: Money;
  idGen?: () => string;
}

/**
 * Build a full, active group for `pkg` with wallets, and optionally fund
 * each member. Used by the demo and the engine tests. Wallet ids are
 * derived from the membership id — good enough for in-memory fixtures.
 */
export function seedFullGroup(pkg: Package, repo: LedgerRepo, opts: SeedOptions = {}): SeededGroup {
  const idGen = opts.idGen ?? randomUUID;
  const group: Group = { id: idGen(), packageId: pkg.id, state: 'active' };
  const memberships: Membership[] = [];

  for (let i = 0; i < pkg.size; i++) {
    const id = idGen();
    const walletId = `wallet-${id}`;
    memberships.push({
      id,
      groupId: group.id,
      userId: `user-${id}`,
      walletId,
      joinOrder: i + 1,
      state: 'active',
    });

    if (opts.topUpEach && !opts.topUpEach.isZero()) {
      repo.appendEntries([
        {
          id: idGen(),
          walletId,
          type: 'topup',
          amount: opts.topUpEach,
          idempotencyKey: `seed:topup:${walletId}`,
          createdAt: new Date(0),
        },
      ]);
    }
  }

  return { group, memberships };
}
