import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import {
  AuthService,
  type AuthConfig,
  InvalidOtpError,
  OtpLockedError,
} from '../src/auth/auth.service';
import { AuthStore } from '../src/auth/auth.store';
import { JwtError, signJwt, verifyJwt } from '../src/auth/jwt';
import { FakeSmsSender } from '../src/auth/sms';
import { runMigrations } from '../src/db/migrate';

const PHONE = '254700000001';
const BASE: AuthConfig = { jwtSecret: 's3cr3t', otpTtlSec: 300, tokenTtlSec: 3600, maxAttempts: 3 };

async function setup(opts: { now?: () => number; config?: Partial<AuthConfig> } = {}) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const store = new AuthStore(pool);
  const sms = new FakeSmsSender();
  const config = { ...BASE, ...opts.config };
  const service = new AuthService(store, sms, config, opts.now ? { now: opts.now } : {});
  return { store, sms, service, config };
}

describe('AuthService OTP', () => {
  it('issues a verifiable session token for a correct code', async () => {
    const { sms, service, config } = await setup();
    await service.requestOtp(PHONE);
    const code = sms.codeFor(PHONE)!;
    expect(code).toMatch(/^\d{6}$/);

    const { token, userId } = await service.verifyOtp(PHONE, code);
    expect(userId).toBeTruthy();
    const claims = verifyJwt<{ sub: string; phone: string }>(token, config.jwtSecret);
    expect(claims.sub).toBe(userId);
    expect(claims.phone).toBe(PHONE);
  });

  it('maps a phone to a stable user id across logins', async () => {
    const { sms, service } = await setup();
    await service.requestOtp(PHONE);
    const first = await service.verifyOtp(PHONE, sms.codeFor(PHONE)!);
    await service.requestOtp(PHONE);
    const second = await service.verifyOtp(PHONE, sms.codeFor(PHONE)!);
    expect(second.userId).toBe(first.userId);
  });

  it('rejects wrong codes and locks after too many attempts', async () => {
    const { sms, service } = await setup({ config: { maxAttempts: 3 } });
    await service.requestOtp(PHONE);
    const real = sms.codeFor(PHONE)!;
    const wrong = real === '000000' ? '000001' : '000000';

    for (let i = 0; i < 3; i++) {
      await expect(service.verifyOtp(PHONE, wrong)).rejects.toBeInstanceOf(InvalidOtpError);
    }
    // Locked now — even the correct code is refused.
    await expect(service.verifyOtp(PHONE, real)).rejects.toBeInstanceOf(OtpLockedError);
  });

  it('rejects an expired code', async () => {
    let clock = 1_000_000_000_000;
    const { sms, service } = await setup({ now: () => clock, config: { otpTtlSec: 60 } });
    await service.requestOtp(PHONE);
    const code = sms.codeFor(PHONE)!;
    clock += 61_000; // past the 60s TTL
    await expect(service.verifyOtp(PHONE, code)).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('rejects a reused code', async () => {
    const { sms, service } = await setup();
    await service.requestOtp(PHONE);
    const code = sms.codeFor(PHONE)!;
    await service.verifyOtp(PHONE, code);
    await expect(service.verifyOtp(PHONE, code)).rejects.toBeInstanceOf(InvalidOtpError);
  });
});

describe('jwt', () => {
  it('round-trips a payload', () => {
    const t = signJwt({ sub: 'u1' }, 'k', 60);
    expect(verifyJwt<{ sub: string }>(t, 'k').sub).toBe('u1');
  });

  it('rejects a tampered token and a wrong secret', () => {
    const t = signJwt({ sub: 'u1' }, 'k', 60);
    expect(() => verifyJwt(`${t}x`, 'k')).toThrow(JwtError);
    expect(() => verifyJwt(t, 'other')).toThrow(JwtError);
  });

  it('rejects an expired token', () => {
    let clock = 1_000_000_000_000;
    const t = signJwt({ sub: 'u1' }, 'k', 1, () => clock);
    clock += 2_000;
    expect(() => verifyJwt(t, 'k', () => clock)).toThrow(JwtError);
  });
});
