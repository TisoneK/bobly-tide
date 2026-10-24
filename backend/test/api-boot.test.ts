import 'reflect-metadata';
import { Controller, Get, Inject } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';

// Spike: confirm NestJS boots and token-based DI resolves under this
// ESM/esbuild toolchain (which does not emit decorator metadata, so DI must
// not rely on constructor type reflection — we inject by explicit token).
const GREETING = Symbol('GREETING');

@Controller()
class HealthController {
  constructor(@Inject(GREETING) private readonly greeting: string) {}

  @Get('health')
  health() {
    return { ok: true, greeting: this.greeting };
  }
}

describe('NestJS boot + token DI', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: GREETING, useValue: 'bobly' }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a route with an injected dependency', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, greeting: 'bobly' });
  });
});
