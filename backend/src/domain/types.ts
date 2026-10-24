import type Decimal from 'decimal.js';
import { Money } from './money';

export type WalletId = string;
export type MembershipId = string;
export type GroupId = string;

/** The single platform account that collects fees (build spec §6). */
export const PLATFORM_WALLET: WalletId = 'PLATFORM';

export type LedgerEntryType =
  | 'topup'
  | 'hourly_debit'
  | 'payout'
  | 'fee'
  | 'withdrawal'
  | 'hold'
  | 'hold_release'
  | 'refund';

/**
 * An immutable money movement. `amount` is signed — negative reduces the
 * wallet. A wallet's balance is the sum of its entries, never a stored,
 * mutable number (build spec §10).
 */
export interface LedgerEntry {
  readonly id: string;
  readonly walletId: WalletId;
  readonly type: LedgerEntryType;
  readonly amount: Money;
  readonly groupId?: GroupId;
  readonly hourIndex?: number;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export interface Package {
  readonly id: string;
  readonly name: string;
  /** N — number of members and hours in a cycle. */
  readonly size: number;
  readonly hourlyContribution: Money;
  /** Fraction, e.g. 0.05 for 5%. */
  readonly feePct: Decimal;
}

export interface Membership {
  readonly id: MembershipId;
  readonly groupId: GroupId;
  readonly userId: string;
  readonly walletId: WalletId;
  /** 1..N; also the member's turn position (hour_index + 1). */
  readonly joinOrder: number;
  state: 'active' | 'defaulted' | 'left';
}

export interface Group {
  readonly id: GroupId;
  readonly packageId: string;
  state: 'filling' | 'active' | 'completed' | 'dissolved';
}
