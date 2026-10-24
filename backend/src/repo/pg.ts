import type { Pool, PoolClient } from 'pg';
import { Money } from '../domain/money';
import type { GroupId, LedgerEntry, LedgerEntryType, WalletId } from '../domain/types';
import { InMemoryLedgerRepo } from './memory';
import { DuplicateKeyError } from './types';

interface Row {
  id: string;
  account_id: string;
  type: string;
  amount: string | number;
  group_id: string | null;
  hour_index: number | null;
  idempotency_key: string;
  created_at: string | Date;
}

function mapRow(row: Row): LedgerEntry {
  const optional: { groupId?: GroupId; hourIndex?: number } = {};
  if (row.group_id != null) optional.groupId = row.group_id;
  if (row.hour_index != null) optional.hourIndex = Number(row.hour_index);
  return {
    id: row.id,
    walletId: row.account_id,
    type: row.type as LedgerEntryType,
    amount: Money.of(row.amount),
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
    ...optional,
  };
}

/** `($1,$2,...)` with the given 1-based offset — avoids `= ANY($1)`, which
 *  pg-mem does not reliably support. */
function placeholders(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `$${offset + i + 1}`).join(', ');
}

/**
 * PostgreSQL-backed persistence for the append-only ledger (build spec §5,
 * §10). This is the durable store, not a drop-in for the synchronous
 * in-memory `LedgerRepo` the pure engine uses: its methods are async. The
 * unit-of-work in `pg-settlement.ts` bridges the two — load a snapshot, run
 * the pure engine, persist the new entries in one transaction.
 */
export class PgLedgerRepo {
  constructor(private readonly pool: Pool) {}

  async hasEntryWithKey(key: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 FROM ledger_entry WHERE idempotency_key = $1 LIMIT 1',
      [key],
    );
    return res.rowCount != null && res.rowCount > 0;
  }

  async balanceOf(accountId: WalletId): Promise<Money> {
    // Sum with decimal.js rather than SQL SUM(): exact at any scale and
    // independent of the driver's numeric handling. For large ledgers this
    // would move to a materialised balance; the pilot ledger is small.
    const res = await this.pool.query<{ amount: string | number }>(
      'SELECT amount FROM ledger_entry WHERE account_id = $1',
      [accountId],
    );
    return res.rows.reduce((acc, r) => acc.plus(Money.of(r.amount)), Money.zero());
  }

  async entriesForAccount(accountId: WalletId): Promise<LedgerEntry[]> {
    const res = await this.pool.query<Row>(
      'SELECT * FROM ledger_entry WHERE account_id = $1 ORDER BY created_at, id',
      [accountId],
    );
    return res.rows.map(mapRow);
  }

  /** Append all entries in one transaction. All-or-nothing: if any
   *  idempotency key already exists the transaction is rolled back and
   *  DuplicateKeyError is thrown — the retry-safety backstop (build spec §6). */
  async appendEntries(entries: readonly LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const keys = entries.map((e) => e.idempotencyKey);
      const existing = await client.query<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM ledger_entry WHERE idempotency_key IN (${placeholders(keys.length)})`,
        keys,
      );
      if (existing.rowCount && existing.rowCount > 0) {
        await client.query('ROLLBACK');
        throw new DuplicateKeyError(existing.rows[0]!.idempotency_key);
      }

      for (const e of entries) {
        await client.query(
          `INSERT INTO ledger_entry
             (id, account_id, type, amount, group_id, hour_index, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            e.id,
            e.walletId,
            e.type,
            e.amount.toString(),
            e.groupId ?? null,
            e.hourIndex ?? null,
            e.idempotencyKey,
            e.createdAt.toISOString(),
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* already rolled back */
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Load the ledger history for a set of accounts into an in-memory repo —
   * the working set the pure engine runs against for one unit of work.
   */
  async loadSnapshot(accountIds: readonly string[]): Promise<InMemoryLedgerRepo> {
    const snap = new InMemoryLedgerRepo();
    if (accountIds.length === 0) return snap;

    const res = await this.pool.query<Row>(
      `SELECT * FROM ledger_entry
       WHERE account_id IN (${placeholders(accountIds.length)})
       ORDER BY created_at, id`,
      accountIds as string[],
    );
    for (const row of res.rows) snap.appendEntries([mapRow(row)]);
    return snap;
  }
}
