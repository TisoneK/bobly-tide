import Decimal from 'decimal.js';
import { Money } from './money';
import type { Package } from './types';

/**
 * The only package in the pilot (build spec §2, ADR-2): 24 members,
 * KES 1/hour, 5% fee. The shape generalises to the larger packages
 * (72/168/...) with no code change — only `size` differs.
 */
export const DAILY_PACKAGE: Package = {
  id: 'pkg-daily',
  name: 'Daily',
  size: 24,
  hourlyContribution: Money.of('1'),
  feePct: new Decimal('0.05'),
};
