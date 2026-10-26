import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RateLimitGuard, type RateLimitConfig } from '../src/api/rate-limit.guard';
import { FixedWindowLimiter, type RateRule } from '../src/security/rate-limit';

function ctxFor(req: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const ipRule: RateRule = {
  name: 'test-ip',
  test: (m, p) => m === 'POST' && p === '/x',
  limit: 2,
  windowMs: 10_000,
  by: 'ip',
};
const phoneRule: RateRule = {
  name: 'test-phone',
  test: (m, p) => m === 'POST' && p === '/otp',
  limit: 1,
  windowMs: 10_000,
  by: 'phone',
};

function guard(config: RateLimitConfig): RateLimitGuard {
  return new RateLimitGuard(new FixedWindowLimiter(), config);
}

describe('RateLimitGuard', () => {
  it('allows up to the limit then throws 429 for the same IP', () => {
    const g = guard({ enabled: true, rules: [ipRule] });
    const req = { method: 'POST', path: '/x', ip: '1.2.3.4' };
    expect(g.canActivate(ctxFor(req))).toBe(true);
    expect(g.canActivate(ctxFor(req))).toBe(true);
    try {
      g.canActivate(ctxFor(req));
      throw new Error('expected 429');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      expect((e as HttpException).message.toLowerCase()).toContain('rate limit');
    }
  });

  it('keys OTP by phone, so different phones are independent', () => {
    const g = guard({ enabled: true, rules: [phoneRule] });
    expect(g.canActivate(ctxFor({ method: 'POST', path: '/otp', ip: '1.1.1.1', body: { phone: '254700000001' } }))).toBe(true);
    // same phone again → blocked
    expect(() =>
      g.canActivate(ctxFor({ method: 'POST', path: '/otp', ip: '9.9.9.9', body: { phone: '254700000001' } })),
    ).toThrow(HttpException);
    // a different phone from the same IP is fine
    expect(g.canActivate(ctxFor({ method: 'POST', path: '/otp', ip: '9.9.9.9', body: { phone: '254700000002' } }))).toBe(true);
  });

  it('passes through unlisted routes and when disabled', () => {
    const on = guard({ enabled: true, rules: [ipRule] });
    expect(on.canActivate(ctxFor({ method: 'GET', path: '/health', ip: '1.2.3.4' }))).toBe(true);
    const off = guard({ enabled: false, rules: [ipRule] });
    const req = { method: 'POST', path: '/x', ip: '1.2.3.4' };
    for (let i = 0; i < 5; i++) expect(off.canActivate(ctxFor(req))).toBe(true);
  });
});
