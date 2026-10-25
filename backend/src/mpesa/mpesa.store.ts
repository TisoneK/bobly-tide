import type { Pool } from 'pg';
import { Money } from '../domain/money';

export type MpesaDirection = 'in' | 'out';
export type MpesaStatus = 'pending' | 'success' | 'failed';

export interface MpesaTxn {
  id: string;
  walletId: string;
  direction: MpesaDirection;
  msisdn: string;
  amount: Money;
  darajaRef: string | null;
  status: MpesaStatus;
}

interface Row {
  id: string;
  wallet_id: string;
  direction: string;
  msisdn: string;
  amount: string | number;
  daraja_ref: string | null;
  status: string;
}

function mapRow(r: Row): MpesaTxn {
  return {
    id: r.id,
    walletId: r.wallet_id,
    direction: r.direction as MpesaDirection,
    msisdn: r.msisdn,
    amount: Money.of(r.amount),
    darajaRef: r.daraja_ref,
    status: r.status as MpesaStatus,
  };
}

/** Persistence for M-Pesa (Daraja) transactions — the audit record of every
 *  top-up and withdrawal and its Daraja reference and status. */
export class MpesaStore {
  constructor(private readonly pool: Pool) {}

  async createPending(txn: {
    id: string;
    walletId: string;
    direction: MpesaDirection;
    msisdn: string;
    amount: Money;
    darajaRef?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO mpesa_txn (id, wallet_id, direction, msisdn, amount, daraja_ref, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [txn.id, txn.walletId, txn.direction, txn.msisdn, txn.amount.toString(), txn.darajaRef ?? null, new Date().toISOString()],
    );
  }

  async setDarajaRef(id: string, darajaRef: string): Promise<void> {
    await this.pool.query('UPDATE mpesa_txn SET daraja_ref = $1 WHERE id = $2', [darajaRef, id]);
  }

  async markStatus(id: string, status: MpesaStatus, rawCallback?: unknown): Promise<void> {
    await this.pool.query('UPDATE mpesa_txn SET status = $1, raw_callback = $2 WHERE id = $3', [
      status,
      rawCallback === undefined ? null : JSON.stringify(rawCallback),
      id,
    ]);
  }

  async findById(id: string): Promise<MpesaTxn | null> {
    const res = await this.pool.query<Row>('SELECT * FROM mpesa_txn WHERE id = $1', [id]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async findByDarajaRef(darajaRef: string): Promise<MpesaTxn | null> {
    const res = await this.pool.query<Row>('SELECT * FROM mpesa_txn WHERE daraja_ref = $1', [darajaRef]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}
