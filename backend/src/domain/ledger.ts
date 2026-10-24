import { Money } from './money';
import type { LedgerEntry } from './types';

/**
 * A wallet's balance is the sum of its signed entries — the one true
 * definition of a balance in this system (build spec §10). Any cached
 * balance must reconcile to this.
 */
export function balanceOf(entries: readonly LedgerEntry[]): Money {
  return entries.reduce((acc, e) => acc.plus(e.amount), Money.zero());
}
