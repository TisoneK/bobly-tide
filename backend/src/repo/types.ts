import type { Money } from '../domain/money';
import type { LedgerEntry, WalletId } from '../domain/types';

export class DuplicateKeyError extends Error {
  constructor(public readonly key: string) {
    super(`ledger entry with idempotency key already exists: ${key}`);
    this.name = 'DuplicateKeyError';
  }
}

/**
 * Persistence boundary for the append-only ledger. The Postgres
 * implementation (db/schema.sql) runs appendEntries inside one
 * serialisable transaction; the in-memory implementation mirrors that
 * all-or-nothing contract for tests and the demo.
 */
export interface LedgerRepo {
  hasEntryWithKey(key: string): boolean;

  /**
   * Append all entries atomically. If ANY idempotency key already exists,
   * nothing is written and DuplicateKeyError is thrown — this is what makes
   * the hourly tick safe to retry (build spec §6, §10).
   */
  appendEntries(entries: readonly LedgerEntry[]): void;

  entriesForWallet(walletId: WalletId): readonly LedgerEntry[];
  allEntries(): readonly LedgerEntry[];
  balanceOf(walletId: WalletId): Money;
}
