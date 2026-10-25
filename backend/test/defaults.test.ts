import { describe, expect, it } from 'vitest';
import { SlotNotVacantError, assignReplacement, processDefault } from '../src/domain/defaults';
import { IncompleteGroupError, settleHour } from '../src/domain/engine';
import { fundHold, holdAvailable } from '../src/domain/holds';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { InMemoryLedgerRepo } from '../src/repo/memory';
import { seedFullGroup } from '../src/seed';

const pkg = DAILY_PACKAGE;

describe('processDefault', () => {
  it('marks the member defaulted, returns the hold, and refunds the wallet', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    const m = memberships.find((x) => x.joinOrder === 1)!;
    fundHold(m, pkg, repo); // wallet → 0, hold → 24 (full prefund locked)

    const res = processDefault(m, repo);

    expect(m.state).toBe('defaulted');
    expect(res.released.equals('24')).toBe(true);
    // Wallet after release = 0 + 24 = 24; all of it refunded (nothing owed).
    expect(res.refunded.equals('24')).toBe(true);
    expect(holdAvailable(repo, m.id).equals('0')).toBe(true);
    expect(repo.balanceOf(m.walletId).equals('0')).toBe(true); // refunded out
  });

  it('subtracts what the member still owes from the refund', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('10') });
    const m = memberships.find((x) => x.joinOrder === 24)!; // H = 0, no hold

    const res = processDefault(m, repo, { owed: Money.of('4') });

    expect(res.refunded.equals('6')).toBe(true); // 10 − 4
    expect(repo.balanceOf(m.walletId).equals('4')).toBe(true); // 10 − 6 refunded out
  });

  it('refunds nothing when the debt exceeds the balance', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('3') });
    const m = memberships.find((x) => x.joinOrder === 24)!;
    const res = processDefault(m, repo, { owed: Money.of('5') });
    expect(res.refunded.equals('0')).toBe(true);
  });
});

describe('assignReplacement / slot refill', () => {
  it('fills a vacated slot so the group can keep settling', () => {
    const repo = new InMemoryLedgerRepo();
    const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });

    // Member at position 5 drops out before the group has settled any hour.
    const leaving = memberships.find((m) => m.joinOrder === 5)!;
    processDefault(leaving, repo);
    expect(() => settleHour(group, pkg, memberships, 0, repo)).toThrow(IncompleteGroupError);

    // Refill the slot from the queue; the replacement inherits position 5.
    const incoming = {
      id: 'new-member',
      groupId: group.id,
      userId: 'user-new',
      walletId: 'wallet-new',
      joinOrder: 5,
      state: 'active' as const,
    };
    repo.appendEntries([
      {
        id: 'topup-new',
        walletId: incoming.walletId,
        type: 'topup',
        amount: Money.of('24'),
        idempotencyKey: 'topup:new',
        createdAt: new Date(0),
      },
    ]);
    assignReplacement(memberships, 5, incoming);

    // Group is full again — settling works.
    const res = settleHour(group, pkg, memberships, 0, repo);
    expect(res.status).toBe('settled');
  });

  it('rejects a replacement while the slot still has an active member', () => {
    const repo = new InMemoryLedgerRepo();
    const { memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of('24') });
    const incoming = {
      id: 'x',
      groupId: memberships[0]!.groupId,
      userId: 'y',
      walletId: 'w',
      joinOrder: 5,
      state: 'active' as const,
    };
    expect(() => assignReplacement(memberships, 5, incoming)).toThrow(SlotNotVacantError);
  });
});
