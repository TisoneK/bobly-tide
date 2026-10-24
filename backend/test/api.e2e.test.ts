import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/api/app.module';
import { GroupStore } from '../src/api/group.store';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { runMigrations } from '../src/db/migrate';
import { ONE_HOUR_MS } from '../src/scheduler';

const pkg = DAILY_PACKAGE;

describe('HTTP API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const db = newDb();
    const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
    await runMigrations(pool);
    await new GroupStore(pool).ensureDailyPackage(pkg);

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          pool,
          pkg,
          scheduler: { enabled: false, tickMs: 60_000, hourMs: ONE_HOUR_MS },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs create → join → topup → start → settle, landing correct balances', async () => {
    const http = app.getHttpServer();

    const created = await request(http).post('/groups').expect(201);
    const groupId = created.body.id as string;
    expect(created.body.size).toBe(pkg.size);

    const wallets: string[] = [];
    for (let i = 0; i < pkg.size; i++) {
      const res = await request(http).post(`/groups/${groupId}/join`).send({}).expect(201);
      wallets.push(res.body.walletId);
    }

    for (const walletId of wallets) {
      await request(http).post(`/wallets/${walletId}/topup`).send({ amount: '24' }).expect(201);
    }

    await request(http).post(`/groups/${groupId}/start`).expect(201);

    const settled = await request(http).post(`/groups/${groupId}/settle-due`).expect(201);
    expect(settled.body.settled).toBeGreaterThanOrEqual(1); // hour 0

    const group = await request(http).get(`/groups/${groupId}`).expect(200);
    const holder = group.body.members.find((m: { joinOrder: number }) => m.joinOrder === 1);
    // Position 1: 24 topup − 23 hold − 1 debit + 22.8 payout = 22.8 spendable.
    expect(holder.balance).toBe('22.8');
    expect(group.body.platform).toBe('1.2');
  });

  it('rejects starting a group that is not full', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/groups').expect(201);
    await request(http).post(`/groups/${created.body.id}/join`).send({}).expect(201);
    await request(http).post(`/groups/${created.body.id}/start`).expect(409);
  });

  it('rejects an invalid top-up amount', async () => {
    const http = app.getHttpServer();
    const created = await request(http).post('/groups').expect(201);
    const joined = await request(http).post(`/groups/${created.body.id}/join`).send({}).expect(201);
    await request(http).post(`/wallets/${joined.body.walletId}/topup`).send({ amount: '-5' }).expect(400);
  });

  it('404s an unknown group', async () => {
    const absent = '00000000-0000-0000-0000-000000000999';
    await request(app.getHttpServer()).get(`/groups/${absent}`).expect(404);
  });
});
