import { balanceOf } from '../domain/ledger';
import { Money } from '../domain/money';
import type { LedgerEntry, WalletId } from '../domain/types';
import { DuplicateKeyError, type LedgerRepo } from './types';

/**
 * In-memory ledger for tests and the demo. Not for production — a real
 * deployment uses the Postgres schema. It faithfully reproduces the two
 * guarantees the engine relies on: unique idempotency keys and
 * all-or-nothing appends.
 */
export class InMemoryLedgerRepo implements LedgerRepo {
  private readonly entries: LedgerEntry[] = [];
  private readonly keys = new Set<string>();

  hasEntryWithKey(key: string): boolean {
    return this.keys.has(key);
  }

  appendEntries(entries: readonly LedgerEntry[]): void {
    // Validate the whole batch before mutating anything (atomicity).
    const seenInBatch = new Set<string>();
    for (const e of entries) {
      if (this.keys.has(e.idempotencyKey) || seenInBatch.has(e.idempotencyKey)) {
        throw new DuplicateKeyError(e.idempotencyKey);
      }
      seenInBatch.add(e.idempotencyKey);
    }
    for (const e of entries) {
      this.entries.push(e);
      this.keys.add(e.idempotencyKey);
    }
  }

  entriesForWallet(walletId: WalletId): readonly LedgerEntry[] {
    return this.entries.filter((e) => e.walletId === walletId);
  }

  allEntries(): readonly LedgerEntry[] {
    return [...this.entries];
  }

  balanceOf(walletId: WalletId): Money {
    return balanceOf(this.entriesForWallet(walletId));
  }
}
