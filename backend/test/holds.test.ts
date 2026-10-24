import { describe, expect, it } from 'vitest';
import { settleHour } from '../src/domain/engine';
import {
  InsufficientFundsForHoldError,
  fundGroupHolds,
  fundHold,
  holdAccountId,
  holdAvailable,
  releaseRemainingHold,
  requiredHold,
} from '../src/domain/holds';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { PLATFORM_WALLET, type Membership } from '../src/domain/types';
import { InMemoryLedgerRepo } from '../src/repo/memory';
import { seedFullGroup } from '../src/seed';

const pkg = DAILY_PACKAGE;

/** Member wallets + hold accounts + platform — the total money in the system. */
function systemTotal(repo: InMemoryLedgerRepo, memberships: readonly Membership[]): Money {
  let t = repo.balanceOf(PLATFORM_WALLET);
  for (const m of memberships) {
    t = t.plus(repo.balanceOf(m.walletId)).plus(repo.balanceOf(holdAccountId(m.id)));
  }
  return t;
}

describe('requiredHold', () => {
  it('is largest for the earliest turn and zero for the last', () => {
    // N=24, c=1 → H(p) = (24 − p) × 1
    expect(requiredHold(pkg, 1).equals('23')).toBe(true);
    expect(requiredHold(pkg, 12).equals('12')).toBe(true);
    expect(requiredHold(pkg, 24).equals('0')).toBe(true);
  });
});

describe('fundHold / releaseRemainingHold', () => {
  it('locks collateral out of the wallet and can return it', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    const m = memberships.find((x) => x.joinOrder === 1)!; // H = 23

    fundHold(m, pkg, repo);
    expect(holdAvailable(repo, m.id).equals('23')).toBe(true);
    expect(repo.balanceOf(m.walletId).equals('1')).toBe(true); // 24 − 23 locked

    // Idempotent: funding again does nothing.
    fundHold(m, pkg, repo);
    expect(holdAvailable(repo, m.id).equals('23')).toBe(true);

    const released = releaseRemainingHold(m, repo);
    expect(released.equals('23')).toBe(true);
    expect(holdAvailable(repo, m.id).equals('0')).toBe(true);
    expect(repo.balanceOf(m.walletId).equals('24')).toBe(true); // back to spendable
  });

  it('refuses to fund a hold the wallet cannot cover', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('5') });
    const m = memberships.find((x) => x.joinOrder === 1)!; // H = 23 > 5
    expect(() => fundHold(m, pkg, repo)).toThrow(InsufficientFundsForHoldError);
  });
});

describe('the engine drawing on the hold', () => {
  it('covers an empty wallet from the security hold instead of coming up short', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo);

    // Everyone funded to pay; the position-2 member has only their hold.
    for (const m of memberships) {
      const topUp = m.joinOrder === 2 ? '22' : '24'; // H(2) = 22
      repo.appendEntries([
        {
          id: `t-${m.id}`,
          walletId: m.walletId,
          type: 'topup',
          amount: Money.of(topUp),
          idempotencyKey: `topup:${m.id}`,
          createdAt: new Date(0),
        },
      ]);
    }
    const broke = memberships.find((m) => m.joinOrder === 2)!;
    fundHold(broke, pkg, repo); // locks 22, wallet → 0
    expect(repo.balanceOf(broke.walletId).equals('0')).toBe(true);

    const seeded = systemTotal(repo, memberships);
    const res = settleHour(group, pkg, memberships, 0, repo);

    expect(res.status).toBe('settled');
    expect(res.heldDraws).toHaveLength(1);
    expect(res.heldDraws[0]!.membershipId).toBe(broke.id);
    expect(res.heldDraws[0]!.amount.equals('1')).toBe(true);
    expect(holdAvailable(repo, broke.id).equals('21')).toBe(true); // 22 − 1 drawn
    expect(repo.balanceOf(broke.walletId).equals('0')).toBe(true); // drew 1, paid 1
    // Pot stayed whole — no money created or destroyed.
    expect(systemTotal(repo, memberships).equals(seeded)).toBe(true);
  });
});

describe('a full cycle with holds funded', () => {
  it('keeps money conserved every hour and returns everyone to KES 22.80', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    fundGroupHolds(pkg, memberships, repo);

    const seeded = systemTotal(repo, memberships); // 576
    expect(seeded.equals('576')).toBe(true);

    for (let hour = 0; hour < pkg.size; hour++) {
      settleHour(group, pkg, memberships, hour, repo);
      expect(systemTotal(repo, memberships).equals(seeded)).toBe(true);
    }

    // Return any collateral still locked, then everyone should sit at 22.80.
    for (const m of memberships) releaseRemainingHold(m, repo);
    for (const m of memberships) {
      expect(holdAvailable(repo, m.id).equals('0')).toBe(true);
      expect(repo.balanceOf(m.walletId).equals('22.8')).toBe(true);
    }
    expect(repo.balanceOf(PLATFORM_WALLET).equals('28.8')).toBe(true);
  });
});
