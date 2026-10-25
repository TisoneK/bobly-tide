import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { beforeEach, describe, expect, it } from 'vitest';
import { GroupStore } from '../src/api/group.store';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { runMigrations } from '../src/db/migrate';
import { type DarajaClient, FakeDarajaClient } from '../src/mpesa/daraja';
import {
  BelowMinimumError,
  InsufficientBalanceError,
  MpesaService,
} from '../src/mpesa/mpesa.service';
import { MpesaStore } from '../src/mpesa/mpesa.store';
import { PgLedgerRepo } from '../src/repo/pg';

const PHONE = '254700000000';
const stkPayload = (checkoutRequestId: string, resultCode: number) => ({
  Body: { stkCallback: { CheckoutRequestID: checkoutRequestId, ResultCode: resultCode } },
});
const b2cPayload = (conversationId: string, resultCode: number) => ({
  Result: { ConversationID: conversationId, ResultCode: resultCode },
});

async function setup(daraja: DarajaClient = new FakeDarajaClient()) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const groups = new GroupStore(pool);
  await groups.ensureDailyPackage(DAILY_PACKAGE);
  const group = await groups.createGroup();
  const member = await groups.joinGroup(group.id, DAILY_PACKAGE);

  const ledger = new PgLedgerRepo(pool);
  const store = new MpesaStore(pool);
  const service = new MpesaService(ledger, store, daraja, { withdrawalMin: Money.of('50') });
  return { ledger, store, service, walletId: member.walletId };
}

describe('M-Pesa top-up (STK push)', () => {
  it('credits the wallet only on a success callback, and only once', async () => {
    const { ledger, store, service, walletId } = await setup();

    const init = await service.initiateTopup(walletId, Money.of('100'), PHONE);
    expect((await ledger.balanceOf(walletId)).equals('0')).toBe(true); // not credited yet

    const ok = await service.handleStkCallback(stkPayload(init.checkoutRequestId, 0));
    expect(ok.credited).toBe(true);
    expect((await ledger.balanceOf(walletId)).equals('100')).toBe(true);
    expect((await store.findById(init.txnId))?.status).toBe('success');

    // Duplicate callback delivery must not double-credit.
    await service.handleStkCallback(stkPayload(init.checkoutRequestId, 0));
    expect((await ledger.balanceOf(walletId)).equals('100')).toBe(true);
  });

  it('does not credit on a failure callback', async () => {
    const { ledger, store, service, walletId } = await setup();
    const init = await service.initiateTopup(walletId, Money.of('100'), PHONE);

    const res = await service.handleStkCallback(stkPayload(init.checkoutRequestId, 1032));
    expect(res.credited).toBe(false);
    expect((await ledger.balanceOf(walletId)).equals('0')).toBe(true);
    expect((await store.findById(init.txnId))?.status).toBe('failed');
  });

  it('ignores a callback for an unknown reference', async () => {
    const { service } = await setup();
    expect(await service.handleStkCallback(stkPayload('nope', 0))).toEqual({
      matched: false,
      credited: false,
    });
  });
});

describe('M-Pesa withdrawal (B2C)', () => {
  async function funded() {
    const ctx = await setup();
    const init = await ctx.service.initiateTopup(ctx.walletId, Money.of('200'), PHONE);
    await ctx.service.handleStkCallback(stkPayload(init.checkoutRequestId, 0));
    return ctx;
  }

  it('reserves funds up front and keeps them gone on a success callback', async () => {
    const { ledger, store, service, walletId } = await funded();

    const w = await service.initiateWithdrawal(walletId, Money.of('50'), PHONE);
    expect((await ledger.balanceOf(walletId)).equals('150')).toBe(true); // reserved immediately

    const ref = (await store.findById(w.txnId))!.darajaRef!;
    await service.handleB2cCallback(b2cPayload(ref, 0));
    expect((await ledger.balanceOf(walletId)).equals('150')).toBe(true); // stays withdrawn
    expect((await store.findById(w.txnId))?.status).toBe('success');
  });

  it('refunds the reservation on a failure callback', async () => {
    const { ledger, store, service, walletId } = await funded();

    const w = await service.initiateWithdrawal(walletId, Money.of('50'), PHONE);
    const ref = (await store.findById(w.txnId))!.darajaRef!;

    const res = await service.handleB2cCallback(b2cPayload(ref, 2001));
    expect(res.refunded).toBe(true);
    expect((await ledger.balanceOf(walletId)).equals('200')).toBe(true); // back to full
    expect((await store.findById(w.txnId))?.status).toBe('failed');
  });

  it('rejects below-minimum and over-balance withdrawals', async () => {
    const { service, walletId } = await funded();
    await expect(service.initiateWithdrawal(walletId, Money.of('10'), PHONE)).rejects.toBeInstanceOf(
      BelowMinimumError,
    );
    await expect(service.initiateWithdrawal(walletId, Money.of('9999'), PHONE)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
  });

  it('reverses the reservation if the B2C call itself fails', async () => {
    const fake = new FakeDarajaClient();
    const throwingB2c: DarajaClient = {
      stkPush: (p) => fake.stkPush(p),
      b2c: () => Promise.reject(new Error('daraja down')),
    };
    const ctx = await setup(throwingB2c);
    // fund directly through a success top-up (stkPush works on the fake path)
    const init = await ctx.service.initiateTopup(ctx.walletId, Money.of('200'), PHONE);
    await ctx.service.handleStkCallback(stkPayload(init.checkoutRequestId, 0));

    await expect(ctx.service.initiateWithdrawal(ctx.walletId, Money.of('50'), PHONE)).rejects.toThrow(
      'daraja down',
    );
    expect((await ctx.ledger.balanceOf(ctx.walletId)).equals('200')).toBe(true); // reservation reversed
  });
});
