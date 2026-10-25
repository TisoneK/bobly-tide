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
const phoneFor = (i: number) => `2547${i.toString().padStart(8, '0')}`;

describe('HTTP API (e2e)', () => {
  let app: INestApplication;
  let sms: FakeSmsSender;

  type Http = ReturnType<INestApplication['getHttpServer']>;

  /** Log in via OTP; returns an Authorization header value. */
  async function login(http: Http, phone: string): Promise<string> {
    await request(http).post('/auth/otp/request').send({ phone }).expect(200);
    const code = sms.codeFor(phone)!;
    const res = await request(http).post('/auth/otp/verify').send({ phone, code }).expect(200);
    return `Bearer ${res.body.token}`;
  }

  /** Fund a wallet the real way: STK push (owner's token), then the callback. */
  async function fund(http: Http, bearer: string, walletId: string, amount: string) {
    const init = await request(http)
      .post(`/wallets/${walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount, phone: phoneFor(1) })
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
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs the member journey: 24 logins → join package → fund → start → settle', async () => {
    const http = app.getHttpServer();

    const tokens: string[] = [];
    const wallets: string[] = [];
    const groupIds: string[] = [];
    for (let i = 1; i <= pkg.size; i++) {
      const bearer = await login(http, phoneFor(i));
      const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
      tokens.push(bearer);
      wallets.push(join.body.walletId);
      groupIds.push(join.body.groupId);
    }

    // Everyone was allocated into the same filling group.
    expect(new Set(groupIds).size).toBe(1);
    const groupId = groupIds[0]!;

    for (let i = 0; i < pkg.size; i++) await fund(http, tokens[i]!, wallets[i]!, '24');

    await request(http).post(`/groups/${groupId}/start`).set('Authorization', tokens[0]!).expect(201);
    const settled = await request(http)
      .post(`/groups/${groupId}/settle-due`)
      .set('Authorization', tokens[0]!)
      .expect(201);
    expect(settled.body.settled).toBeGreaterThanOrEqual(1);

    const group = await request(http).get(`/groups/${groupId}`).set('Authorization', tokens[0]!).expect(200);
    expect(group.body.yourPosition).toBe(1);
    expect(group.body.yourBalance).toBe('22.8'); // 24 − 23 hold − 1 + 22.8 payout
    expect(group.body.members).toHaveLength(pkg.size);
  });

  it('ties a join to the caller and refuses acting on another member\'s wallet', async () => {
    const http = app.getHttpServer();
    const a = await login(http, phoneFor(1));
    const b = await login(http, phoneFor(2));
    const ja = await request(http).post('/packages/daily/join').set('Authorization', a).expect(201);
    const jb = await request(http).post('/packages/daily/join').set('Authorization', b).expect(201);
    expect(ja.body.groupId).toBe(jb.body.groupId); // same filling group

    // A cannot top up B's wallet.
    await request(http)
      .post(`/wallets/${jb.body.walletId}/topup`)
      .set('Authorization', a)
      .send({ amount: '24', phone: phoneFor(1) })
      .expect(403);

    // A non-member cannot view the group.
    const c = await login(http, phoneFor(3));
    await request(http).get(`/groups/${ja.body.groupId}`).set('Authorization', c).expect(403);
  });

  it('requires a token to join, and keeps callbacks public', async () => {
    const http = app.getHttpServer();
    await request(http).post('/packages/daily/join').expect(401);
    await request(http)
      .post('/mpesa/callbacks/stk')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'unknown', ResultCode: 0 } } })
      .expect(200);
  });

  it('rejects an invalid top-up amount on your own wallet', async () => {
    const http = app.getHttpServer();
    const bearer = await login(http, phoneFor(1));
    const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
    await request(http)
      .post(`/wallets/${join.body.walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount: '-5', phone: phoneFor(1) })
      .expect(400);
  });
});
