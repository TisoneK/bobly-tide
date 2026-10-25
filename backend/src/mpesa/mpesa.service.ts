import { randomUUID } from 'node:crypto';
import { Money } from '../domain/money';
import { withLedger } from '../pg-settlement';
import type { PgLedgerRepo } from '../repo/pg';
import type { DarajaClient } from './daraja';
import type { MpesaStore } from './mpesa.store';

export class InsufficientBalanceError extends Error {
  constructor() {
    super('insufficient wallet balance for withdrawal');
    this.name = 'InsufficientBalanceError';
  }
}
export class BelowMinimumError extends Error {
  constructor(min: Money) {
    super(`withdrawal is below the minimum of ${min.toString()}`);
    this.name = 'BelowMinimumError';
  }
}

export interface MpesaConfig {
  /** Withdrawal minimum (product spec §7; placeholder KES 50). */
  withdrawalMin: Money;
}

interface StkCallback {
  checkoutRequestId: string;
  resultCode: number;
}
interface B2cCallback {
  conversationId: string;
  resultCode: number;
}

/** Parse the Daraja STK push callback envelope. */
export function parseStkCallback(payload: unknown): StkCallback | null {
  const cb = (payload as { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number | string } } })
    ?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return null;
  return { checkoutRequestId: cb.CheckoutRequestID, resultCode: Number(cb.ResultCode) };
}

/** Parse the Daraja B2C result callback envelope. */
export function parseB2cCallback(payload: unknown): B2cCallback | null {
  const r = (payload as { Result?: { ConversationID?: string; ResultCode?: number | string } })?.Result;
  if (!r?.ConversationID) return null;
  return { conversationId: r.ConversationID, resultCode: Number(r.ResultCode) };
}

function toShillings(amount: Money): number {
  return Number(amount.toString());
}

/**
 * M-Pesa money movement (build spec §7). The wallet is the single source of
 * truth and moves on the *confirming callback*:
 *   - top-up: credited only when the STK callback reports success;
 *   - withdrawal: funds are reserved (debited) at request time so they cannot
 *     be double-spent, the reservation stands on a success callback, and is
 *     reversed (refunded) on failure.
 * Every wallet move is idempotent (keyed on the Daraja reference / local
 * ref), so a callback delivered more than once never moves money twice.
 */
export class MpesaService {
  constructor(
    private readonly ledger: PgLedgerRepo,
    private readonly store: MpesaStore,
    private readonly daraja: DarajaClient,
    private readonly config: MpesaConfig,
  ) {}

  async initiateTopup(
    walletId: string,
    amount: Money,
    phone: string,
  ): Promise<{ txnId: string; checkoutRequestId: string; status: 'pending' }> {
    const stk = await this.daraja.stkPush({
      amount: toShillings(amount),
      phone,
      accountRef: walletId.slice(0, 12),
      description: 'Bobly Tide top-up',
    });
    const id = randomUUID();
    await this.store.createPending({
      id,
      walletId,
      direction: 'in',
      msisdn: phone,
      amount,
      darajaRef: stk.checkoutRequestId,
    });
    return { txnId: id, checkoutRequestId: stk.checkoutRequestId, status: 'pending' };
  }

  /** Handle an STK push callback. Credits the wallet on success, idempotently. */
  async handleStkCallback(payload: unknown): Promise<{ matched: boolean; credited: boolean }> {
    const cb = parseStkCallback(payload);
    if (!cb) return { matched: false, credited: false };
    const txn = await this.store.findByDarajaRef(cb.checkoutRequestId);
    if (!txn) return { matched: false, credited: false };

    if (cb.resultCode === 0) {
      const key = `mpesa:topup:${cb.checkoutRequestId}`;
      if (!(await this.ledger.hasEntryWithKey(key))) {
        await withLedger(this.ledger, [txn.walletId], (mem) =>
          mem.appendEntries([
            {
              id: randomUUID(),
              walletId: txn.walletId,
              type: 'topup',
              amount: txn.amount,
              idempotencyKey: key,
              createdAt: new Date(),
            },
          ]),
        );
      }
      await this.store.markStatus(txn.id, 'success', payload);
      return { matched: true, credited: true };
    }

    await this.store.markStatus(txn.id, 'failed', payload);
    return { matched: true, credited: false };
  }

  async initiateWithdrawal(
    walletId: string,
    amount: Money,
    phone: string,
  ): Promise<{ txnId: string; status: 'pending' }> {
    if (amount.lessThan(this.config.withdrawalMin)) throw new BelowMinimumError(this.config.withdrawalMin);
    const balance = await this.ledger.balanceOf(walletId);
    if (balance.lessThan(amount)) throw new InsufficientBalanceError();

    const id = randomUUID();
    // Reserve the funds up front so they cannot be spent while the B2C is in
    // flight; failure reverses this.
    await withLedger(this.ledger, [walletId], (mem) =>
      mem.appendEntries([
        {
          id: randomUUID(),
          walletId,
          type: 'withdrawal',
          amount: amount.negated(),
          idempotencyKey: `mpesa:withdraw:${id}`,
          createdAt: new Date(),
        },
      ]),
    );
    await this.store.createPending({ id, walletId, direction: 'out', msisdn: phone, amount, darajaRef: null });

    try {
      const res = await this.daraja.b2c({ amount: toShillings(amount), phone, occasionRef: id });
      await this.store.setDarajaRef(id, res.conversationId);
    } catch (err) {
      await this.refund(id, walletId, amount);
      await this.store.markStatus(id, 'failed', { error: (err as Error).message });
      throw err;
    }

    return { txnId: id, status: 'pending' };
  }

  /** Handle a B2C result callback. Success finalises the reservation; failure
   *  refunds it. Idempotent. */
  async handleB2cCallback(payload: unknown): Promise<{ matched: boolean; refunded: boolean }> {
    const cb = parseB2cCallback(payload);
    if (!cb) return { matched: false, refunded: false };
    const txn = await this.store.findByDarajaRef(cb.conversationId);
    if (!txn) return { matched: false, refunded: false };
    if (txn.status !== 'pending') return { matched: true, refunded: false };

    if (cb.resultCode === 0) {
      await this.store.markStatus(txn.id, 'success', payload);
      return { matched: true, refunded: false };
    }

    await this.refund(txn.id, txn.walletId, txn.amount);
    await this.store.markStatus(txn.id, 'failed', payload);
    return { matched: true, refunded: true };
  }

  private async refund(txnId: string, walletId: string, amount: Money): Promise<void> {
    const key = `mpesa:withdraw-refund:${txnId}`;
    if (await this.ledger.hasEntryWithKey(key)) return;
    await withLedger(this.ledger, [walletId], (mem) =>
      mem.appendEntries([
        {
          id: randomUUID(),
          walletId,
          type: 'refund',
          amount,
          idempotencyKey: key,
          createdAt: new Date(),
        },
      ]),
    );
  }
}
