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
import { FakeAlertSink } from '../src/security/alert';
import { ONE_HOUR_MS } from '../src/scheduler';
import { FakeEmailSender, FakeKycProvider } from '../src/verification/providers';

const pkg = DAILY_PACKAGE;
const phoneFor = (i: number) => `2547${i.toString().padStart(8, '0')}`;
const emailFor = (i: number) => `member${i}@example.com`;
const ADMIN_PHONE = '254799999999';

describe('HTTP API (e2e)', () => {
  let app: INestApplication;
  let sms: FakeSmsSender;
  let email: FakeEmailSender;

  type Http = ReturnType<INestApplication['getHttpServer']>;

  /** Log in via OTP; returns an Authorization header value. */
  async function login(http: Http, phone: string): Promise<string> {
    await request(http).post('/auth/otp/request').send({ phone }).expect(200);
    const code = sms.codeFor(phone)!;
    const res = await request(http).post('/auth/otp/verify').send({ phone, code }).expect(200);
    return `Bearer ${res.body.token}`;
  }

  /** Complete every KYC item for the logged-in member. */
  async function verifyFully(http: Http, bearer: string, addr: string) {
    await request(http).post('/verification/email/request').set('Authorization', bearer).send({ email: addr }).expect(200);
    await request(http)
      .post('/verification/email/verify')
      .set('Authorization', bearer)
      .send({ code: email.codeFor(addr) })
      .expect(200);
    for (const kind of ['id', 'face', 'address']) {
      await request(http)
        .post('/verification/submit')
        .set('Authorization', bearer)
        .send({ kind, reference: `${kind}-ref` })
        .expect(201);
    }
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
    email = new FakeEmailSender();

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          pool,
          pkg,
          scheduler: { enabled: false, tickMs: 60_000, hourMs: ONE_HOUR_MS, fillTimeoutMs: ONE_HOUR_MS },
          daraja: new FakeDarajaClient(),
          mpesa: { withdrawalMin: Money.of('50') },
          mpesaCallback: { secret: '', allowedIps: [] },
          auth: { jwtSecret: 'test-secret', otpTtlSec: 300, tokenTtlSec: 3600, maxAttempts: 5 },
          sms,
          email,
          kyc: new FakeKycProvider(true),
          verification: {
            secret: 'test-secret',
            requiredKinds: ['email', 'id', 'face', 'address'],
            emailCodeTtlSec: 600,
            maxAttempts: 5,
          },
          admin: { phones: new Set([ADMIN_PHONE]) },
          groupJoinLimit: 3,
          alert: new FakeAlertSink(),
          security: { alertWindowMs: 600_000, alertThreshold: 5 },
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
      await verifyFully(http, bearer, emailFor(i));
      const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
      tokens.push(bearer);
      wallets.push(join.body.walletId);
      groupIds.push(join.body.groupId);
    }

    // Everyone was allocated into the same filling group.
    expect(new Set(groupIds).size).toBe(1);
    const groupId = groupIds[0]!;

    for (let i = 0; i < pkg.size; i++) await fund(http, tokens[i]!, wallets[i]!, '24');

    // Each member posts their security (FCFS); the last secure activates the group.
    for (let i = 0; i < pkg.size; i++) {
      const res = await request(http).post(`/groups/${groupId}/secure`).set('Authorization', tokens[i]!).expect(201);
      expect(res.body.turnPosition).toBe(i + 1);
    }

    const settled = await request(http)
      .post(`/groups/${groupId}/settle-due`)
      .set('Authorization', tokens[0]!)
      .expect(201);
    expect(settled.body.settled).toBeGreaterThanOrEqual(1);

    const group = await request(http).get(`/groups/${groupId}`).set('Authorization', tokens[0]!).expect(200);
    expect(group.body.state).toBe('active');
    expect(group.body.yourPosition).toBe(1); // member 0 secured first
    expect(group.body.yourTurnAt).not.toBeNull(); // countdown target
    expect(group.body.yourBalance).toBe('22.8'); // 24 − 23 hold − 1 + 22.8 payout
    expect(group.body.members).toHaveLength(pkg.size);
  });

  it('assigns payout position by security order, not join order (FCFS)', async () => {
    const http = app.getHttpServer();
    const a = await login(http, phoneFor(1));
    const b = await login(http, phoneFor(2));
    await verifyFully(http, a, emailFor(1));
    await verifyFully(http, b, emailFor(2));
    const ja = await request(http).post('/packages/daily/join').set('Authorization', a).expect(201);
    const jb = await request(http).post('/packages/daily/join').set('Authorization', b).expect(201);
    expect(ja.body.groupId).toBe(jb.body.groupId); // same filling group, A joined first

    // Fund both, then B secures BEFORE A.
    await fund(http, b, jb.body.walletId, '24');
    await fund(http, a, ja.body.walletId, '24');
    const sb = await request(http).post(`/groups/${jb.body.groupId}/secure`).set('Authorization', b).expect(201);
    const sa = await request(http).post(`/groups/${ja.body.groupId}/secure`).set('Authorization', a).expect(201);

    // B secured first → position 1, though A joined first.
    expect(sb.body.turnPosition).toBe(1);
    expect(sa.body.turnPosition).toBe(2);
  });

  it('blocks joining and spending until the member is verified', async () => {
    const http = app.getHttpServer();
    const bearer = await login(http, phoneFor(7));
    // Not verified yet → join is forbidden.
    await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(403);
    const status = await request(http).get('/verification').set('Authorization', bearer).expect(200);
    expect(status.body.verified).toBe(false);
    expect(status.body.missing.sort()).toEqual(['address', 'email', 'face', 'id']);
    // After full KYC, join succeeds.
    await verifyFully(http, bearer, emailFor(7));
    await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
  });

  it('ties a join to the caller and refuses acting on another member\'s wallet', async () => {
    const http = app.getHttpServer();
    const a = await login(http, phoneFor(1));
    const b = await login(http, phoneFor(2));
    await verifyFully(http, a, emailFor(1));
    await verifyFully(http, b, emailFor(2));
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
    await verifyFully(http, bearer, emailFor(1));
    const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
    await request(http)
      .post(`/wallets/${join.body.walletId}/topup`)
      .set('Authorization', bearer)
      .send({ amount: '-5', phone: phoneFor(1) })
      .expect(400);
  });

  it('restricts the admin console to admins', async () => {
    const http = app.getHttpServer();
    const member = await login(http, phoneFor(1));
    await request(http).get('/admin/verifications').set('Authorization', member).expect(403);
    await request(http).get('/admin/groups').set('Authorization', member).expect(403);
    const admin = await login(http, ADMIN_PHONE);
    await request(http).get('/admin/verifications').set('Authorization', admin).expect(200);
    await request(http).get('/admin/groups').set('Authorization', admin).expect(200);
  });

  it('records security events and shows them to admins only', async () => {
    const http = app.getHttpServer();
    const member = await login(http, phoneFor(2));
    // A non-admin hitting the console is a denied-authorization event.
    await request(http).get('/admin/security-events').set('Authorization', member).expect(403);
    await request(http).get('/admin/verifications').set('Authorization', member).expect(403);
    // No bearer at all is a failed-auth event.
    await request(http).get('/admin/groups').expect(401);

    const admin = await login(http, ADMIN_PHONE);
    const events = await request(http).get('/admin/security-events').set('Authorization', admin).expect(200);
    const types = (events.body as { type: string }[]).map((e) => e.type);
    expect(types).toContain('admin_denied');
    expect(types).toContain('auth_failed');
  });

  it('gives admins group + member oversight', async () => {
    const http = app.getHttpServer();
    const bearer = await login(http, phoneFor(1));
    await verifyFully(http, bearer, emailFor(1));
    const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
    const admin = await login(http, ADMIN_PHONE);

    const list = await request(http).get('/admin/groups?limit=10').set('Authorization', admin).expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const row = list.body.find((g: { id: string }) => g.id === join.body.groupId);
    expect(row).toMatchObject({ state: 'filling', joined: 1, secured: 0, size: pkg.size });

    const detail = await request(http)
      .get(`/admin/groups/${join.body.groupId}`)
      .set('Authorization', admin)
      .expect(200);
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.members[0]).toMatchObject({ joinOrder: 1, state: 'active', secured: false });
    expect(detail.body.members[0].phone).toBe(phoneFor(1)); // unmasked for ops

    await request(http).get('/admin/groups/not-a-uuid').set('Authorization', admin).expect(404);
  });

  it('lets a member leave a group that has not started', async () => {
    const http = app.getHttpServer();
    const bearer = await login(http, phoneFor(1));
    await verifyFully(http, bearer, emailFor(1));
    const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
    const res = await request(http).post(`/groups/${join.body.groupId}/leave`).set('Authorization', bearer).expect(201);
    expect(res.body.left).toBe(true);
  });

  it('refuses to renew a group that is still filling', async () => {
    const http = app.getHttpServer();
    const bearer = await login(http, phoneFor(1));
    await verifyFully(http, bearer, emailFor(1));
    const join = await request(http).post('/packages/daily/join').set('Authorization', bearer).expect(201);
    await request(http).post(`/groups/${join.body.groupId}/renew`).set('Authorization', bearer).expect(409);
  });
});
