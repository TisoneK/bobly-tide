import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/api/app.module';
import { GroupStore } from '../src/api/group.store';
import { FakeSmsSender } from '../src/auth/sms';
import { Money } from '../src/domain/money';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { runMigrations } from '../src/db/migrate';
import { FakeDarajaClient } from '../src/mpesa/daraja';
import { ONE_HOUR_MS } from '../src/scheduler';

const pkg = DAILY_PACKAGE;
const PHONE = '254700000000';

describe('HTTP API (e2e)', () => {
  let app: INestApplication;
  let sms: FakeSmsSender;
  let bearer: string;

  type Http = ReturnType<INestApplication['getHttpServer']>;

  /** Log in via OTP and return an Authorization header value. */
  async function login(http: Http, phone: string): Promise<string> {
    await request(http).post('/auth/otp/request').send({ phone }).expect(200);
    const code = sms.codeFor(phone)!;
    const res = await request(http).post('/auth/otp/verify').send({ phone, code }).expect(200);
    return `Bearer ${res.body.token}`;
  }

  /** Fund a wallet the real way: STK push, then the confirming callback. */
  async function fund(http: Http, walletId: string, amount: string) {
    const init = await request(http)
      .post(`/wallets/${walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount, phone: PHONE })
      .expect(201);
    await request(http)
      .post('/mpesa/callbacks/stk')
      .send({ Body: { stkCallback: { CheckoutRequestID: init.body.checkoutRequestId, ResultCode: 0 } } })
      .expect(200);
  }

  beforeEach(async () => {
    const db = newDb();
    const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
    await runMigrations(pool);
    await new GroupStore(pool).ensureDailyPackage(pkg);
    sms = new FakeSmsSender();

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          pool,
          pkg,
          scheduler: { enabled: false, tickMs: 60_000, hourMs: ONE_HOUR_MS },
          daraja: new FakeDarajaClient(),
          mpesa: { withdrawalMin: Money.of('50') },
          auth: { jwtSecret: 'test-secret', otpTtlSec: 300, tokenTtlSec: 3600, maxAttempts: 5 },
          sms,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    bearer = await login(app.getHttpServer(), '254711111111');
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs create → join → M-Pesa top-up → start → settle, landing correct balances', async () => {
    const http = app.getHttpServer();

    const created = await request(http).post('/groups').set('Authorization', bearer).expect(201);
    const groupId = created.body.id as string;
    expect(created.body.size).toBe(pkg.size);

    const wallets: string[] = [];
    for (let i = 0; i < pkg.size; i++) {
      const res = await request(http)
        .post(`/groups/${groupId}/join`)
        .set('Authorization', bearer)
        .send({})
        .expect(201);
      wallets.push(res.body.walletId);
    }

    for (const walletId of wallets) await fund(http, walletId, '24');

    await request(http).post(`/groups/${groupId}/start`).set('Authorization', bearer).expect(201);

    const settled = await request(http)
      .post(`/groups/${groupId}/settle-due`)
      .set('Authorization', bearer)
      .expect(201);
    expect(settled.body.settled).toBeGreaterThanOrEqual(1); // hour 0

    const group = await request(http).get(`/groups/${groupId}`).set('Authorization', bearer).expect(200);
    const holder = group.body.members.find((m: { joinOrder: number }) => m.joinOrder === 1);
    // Position 1: 24 topup − 23 hold − 1 debit + 22.8 payout = 22.8 spendable.
    expect(holder.balance).toBe('22.8');
    expect(group.body.platform).toBe('1.2');
  });

  it('credits a wallet only after the STK callback confirms', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/groups').set('Authorization', bearer).expect(201);
    const joined = await request(http)
      .post(`/groups/${created.body.id}/join`)
      .set('Authorization', bearer)
      .send({})
      .expect(201);
    const walletId = joined.body.walletId as string;

    const init = await request(http)
      .post(`/wallets/${walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount: '100', phone: PHONE })
      .expect(201);
    let w = await request(http).get(`/wallets/${walletId}`).set('Authorization', bearer).expect(200);
    expect(w.body.balance).toBe('0'); // not credited until the callback

    await request(http)
      .post('/mpesa/callbacks/stk')
      .send({ Body: { stkCallback: { CheckoutRequestID: init.body.checkoutRequestId, ResultCode: 0 } } })
      .expect(200);
    w = await request(http).get(`/wallets/${walletId}`).set('Authorization', bearer).expect(200);
    expect(w.body.balance).toBe('100');
  });

  it('requires a valid token on protected routes', async () => {
    const http = app.getHttpServer();
    await request(http).post('/groups').expect(401); // no token
    await request(http).post('/groups').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('leaves the M-Pesa callbacks public', async () => {
    const http = app.getHttpServer();
    await request(http)
      .post('/mpesa/callbacks/stk')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'unknown', ResultCode: 0 } } })
      .expect(200);
  });

  it('rejects starting a group that is not full', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/groups').set('Authorization', bearer).expect(201);
    await request(http).post(`/groups/${created.body.id}/join`).set('Authorization', bearer).send({}).expect(201);
    await request(http).post(`/groups/${created.body.id}/start`).set('Authorization', bearer).expect(409);
  });

  it('rejects an invalid top-up amount', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/groups').set('Authorization', bearer).expect(201);
    const joined = await request(http)
      .post(`/groups/${created.body.id}/join`)
      .set('Authorization', bearer)
      .send({})
      .expect(201);
    await request(http)
      .post(`/wallets/${joined.body.walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount: '-5', phone: PHONE })
      .expect(400);
  });

  it('404s an unknown group', async () => {
    const absent = '00000000-0000-0000-0000-000000000999';
    await request(app.getHttpServer()).get(`/groups/${absent}`).set('Authorization', bearer).expect(404);
  });
});
