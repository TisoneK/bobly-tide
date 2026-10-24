import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from './api/app.module';
import { GroupStore } from './api/group.store';
import { runMigrations } from './db/migrate';
import { DAILY_PACKAGE } from './domain/packages';
import { ONE_HOUR_MS } from './scheduler';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
await runMigrations(pool);
await new GroupStore(pool).ensureDailyPackage(DAILY_PACKAGE);

const app = await NestFactory.create(
  AppModule.forRoot({
    pool,
    pkg: DAILY_PACKAGE,
    scheduler: {
      enabled: true,
      tickMs: Number(process.env['TICK_MS'] ?? 60_000),
      hourMs: Number(process.env['HOUR_MS'] ?? ONE_HOUR_MS),
    },
  }),
);

const port = Number(process.env['PORT'] ?? 3000);
await app.listen(port);
console.log(`Bobly Tide API listening on :${port}`);
