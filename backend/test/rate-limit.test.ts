import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_RULES, FixedWindowLimiter, matchRule } from '../src/security/rate-limit';

describe('FixedWindowLimiter', () => {
  it('allows up to the limit, then blocks within the window', () => {
    let t = 1_000;
    const lim = new FixedWindowLimiter(() => t);
    for (let i = 0; i < 3; i++) expect(lim.check('k', 3, 10_000).allowed).toBe(true);
    const blocked = lim.check('k', 3, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetInMs).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    let t = 1_000;
    const lim = new FixedWindowLimiter(() => t);
    lim.check('k', 1, 10_000);
    expect(lim.check('k', 1, 10_000).allowed).toBe(false);
    t += 10_001; // window passed
    expect(lim.check('k', 1, 10_000).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    let t = 1_000;
    const lim = new FixedWindowLimiter(() => t);
    expect(lim.check('a', 1, 10_000).allowed).toBe(true);
    expect(lim.check('a', 1, 10_000).allowed).toBe(false);
    expect(lim.check('b', 1, 10_000).allowed).toBe(true); // different key, fresh
  });
});

describe('matchRule (default rules)', () => {
  it('matches the throttled routes and ignores the rest', () => {
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/auth/otp/request')?.by).toBe('phone');
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/auth/otp/verify')?.by).toBe('phone');
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/verification/email/request')?.name).toBe('email-request');
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/wallets/abc-123/topup')?.name).toBe('wallet-money');
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/wallets/abc-123/withdraw')?.name).toBe('wallet-money');
    expect(matchRule(DEFAULT_RATE_RULES, 'GET', '/groups/x')).toBeNull();
    expect(matchRule(DEFAULT_RATE_RULES, 'POST', '/packages/daily/join')).toBeNull();
  });
});
