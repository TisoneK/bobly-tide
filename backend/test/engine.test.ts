import { describe, expect, it } from 'vitest';
import {
  IncompleteGroupError,
  InvalidHourError,
  ShortfallError,
  settleCycle,
  settleHour,
} from '../src/domain/engine';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { PLATFORM_WALLET, type Membership } from '../src/domain/types';
import { InMemoryLedgerRepo } from '../src/repo/memory';
import { seedFullGroup } from '../src/seed';

const pkg = DAILY_PACKAGE;

/** Total money held across every member wallet plus the platform account. */
function totalMoney(repo: InMemoryLedgerRepo, memberships: readonly Membership[]): Money {
  let total = repo.balanceOf(PLATFORM_WALLET);
  for (const m of memberships) total = total.plus(repo.balanceOf(m.walletId));
  return total;
}

describe('settleHour', () => {
  it('debits every member, pays the turn holder, and takes the fee', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });

    const res = settleHour(group, pkg, memberships, 0, repo);

    expect(res.status).toBe('settled');
    expect(res.pot.equals('24')).toBe(true);
    expect(res.fee.equals('1.2')).toBe(true);
    expect(res.payout.equals('22.8')).toBe(true);

    // Hour 0 pays the member at join order 1.
    const holder = memberships.find((m) => m.joinOrder === 1)!;
    const other = memberships.find((m) => m.joinOrder === 2)!;
    expect(res.turnHolderId).toBe(holder.id);

    // Holder: 24 topup − 1 debit + 22.8 payout = 45.8
    expect(repo.balanceOf(holder.walletId).equals('45.8')).toBe(true);
    // Everyone else: 24 − 1 = 23
    expect(repo.balanceOf(other.walletId).equals('23')).toBe(true);
    // Platform collected the fee.
    expect(repo.balanceOf(PLATFORM_WALLET).equals('1.2')).toBe(true);

    // Nothing created or destroyed: still 24 × 24 = 576 in the system.
    expect(totalMoney(repo, memberships).equals('576')).toBe(true);
  });

  it('is idempotent: re-running the same hour writes nothing new', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });

    settleHour(group, pkg, memberships, 0, repo);
    const countAfterFirst = repo.allEntries().length;
    const holderBalance = repo.balanceOf(memberships[0]!.walletId);

    const again = settleHour(group, pkg, memberships, 0, repo);

    expect(again.status).toBe('already-settled');
    expect(again.entries).toHaveLength(0);
    expect(repo.allEntries().length).toBe(countAfterFirst);
    expect(repo.balanceOf(memberships[0]!.walletId).equals(holderBalance)).toBe(true);
  });

  it('refuses to settle when a member cannot cover the contribution', () => {
    const repo = new InMemoryLedgerRepo();
    // No auto top-up; fund all but the last member.
    const { group, memberships } = seedFullGroup(pkg, repo);
    const broke = memberships.find((m) => m.joinOrder === pkg.size)!;
    for (const m of memberships) {
      if (m.id === broke.id) continue;
      repo.appendEntries([
        {
          id: `topup-${m.id}`,
          walletId: m.walletId,
          type: 'topup',
          amount: Money.of('24'),
          idempotencyKey: `topup:${m.walletId}`,
          createdAt: new Date(0),
        },
      ]);
    }

    const before = repo.allEntries().length;
    let thrown: unknown;
    try {
      settleHour(group, pkg, memberships, 0, repo);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ShortfallError);
    expect((thrown as ShortfallError).short.map((s) => s.membershipId)).toEqual([broke.id]);
    // The ledger is untouched — no partial settlement.
    expect(repo.allEntries().length).toBe(before);
  });

  it('rejects an out-of-range hour', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    expect(() => settleHour(group, pkg, memberships, pkg.size, repo)).toThrow(InvalidHourError);
    expect(() => settleHour(group, pkg, memberships, -1, repo)).toThrow(InvalidHourError);
  });

  it('rejects a group that is not full', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    memberships[5]!.state = 'left';
    expect(() => settleHour(group, pkg, memberships, 0, repo)).toThrow(IncompleteGroupError);
  });
});

describe('a full cycle', () => {
  it('returns every member their money minus the fee, and conserves money each hour', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    const seeded = totalMoney(repo, memberships); // 576

    // Settle hour by hour, checking conservation after each.
    for (let hour = 0; hour < pkg.size; hour++) {
      settleHour(group, pkg, memberships, hour, repo);
      expect(totalMoney(repo, memberships).equals(seeded)).toBe(true);
    }

    // Every member paid in 24 and received 22.80 exactly once → ends at 22.80.
    for (const m of memberships) {
      expect(repo.balanceOf(m.walletId).equals('22.8')).toBe(true);
    }
    // Platform earned 1.20 × 24 hours = 28.80.
    expect(repo.balanceOf(PLATFORM_WALLET).equals('28.8')).toBe(true);
  });

  it('settleCycle settles all hours and marks the group completed', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });

    const results = settleCycle(group, pkg, memberships, repo);

    expect(results).toHaveLength(pkg.size);
    expect(results.every((r) => r.status === 'settled')).toBe(true);
    expect(group.state).toBe('completed');
    // Each of the 24 members was the turn holder exactly once.
    expect(new Set(results.map((r) => r.turnHolderId)).size).toBe(pkg.size);
  });
});
