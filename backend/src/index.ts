// Demo: run one full Daily cycle on the in-memory ledger and print the
// result. Proves the hourly engine end to end without a database or UI
// (build spec §14 step 2). Run with `npm run demo`.
import { settleCycle } from './domain/engine';
import { fundGroupHolds, holdAccountId, releaseRemainingHold } from './domain/holds';
import { Money } from './domain/money';
import { DAILY_PACKAGE } from './domain/packages';
import { PLATFORM_WALLET } from './domain/types';
import { InMemoryLedgerRepo } from './repo/memory';
import { seedFullGroup } from './seed';

const repo = new InMemoryLedgerRepo();
const pkg = DAILY_PACKAGE;

// Fund every member, then lock each one's security hold (sized by turn
// position) before the group starts.
const { group, memberships } = seedFullGroup(pkg, repo, { topUpEach: Money.of(pkg.size) });
fundGroupHolds(pkg, memberships, repo);

const results = settleCycle(group, pkg, memberships, repo);
const draws = results.reduce((n, r) => n + r.heldDraws.length, 0);

// Return any collateral still locked at the end of the cycle.
for (const m of memberships) releaseRemainingHold(m, repo);

console.log(`Package: ${pkg.name} (${pkg.size} members, ${pkg.feePct.times(100)}% fee)`);
console.log(`Hours settled: ${results.length}, group state: ${group.state}`);
console.log(`Each hour: pot ${results[0]!.pot.toDisplay()}, ` +
  `payout ${results[0]!.payout.toDisplay()}, fee ${results[0]!.fee.toDisplay()}`);
console.log(`Hold draws during the cycle: ${draws}`);
console.log('');

const m0 = memberships[0]!;
console.log(`Member #1 wallet after cycle: ${repo.balanceOf(m0.walletId).toDisplay()}`);
console.log(`Platform fee account after cycle: ${repo.balanceOf(PLATFORM_WALLET).toDisplay()}`);

// Money is neither created nor destroyed — sum wallets + hold accounts + fee.
let total = repo.balanceOf(PLATFORM_WALLET);
for (const m of memberships) {
  total = total.plus(repo.balanceOf(m.walletId)).plus(repo.balanceOf(holdAccountId(m.id)));
}
console.log(`Total money in system: ${total.toDisplay()} (seeded: ${Money.of(pkg.size).times(pkg.size).toDisplay()})`);
