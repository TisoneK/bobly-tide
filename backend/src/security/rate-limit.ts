// General request rate limiting (ADR-25) — a defence against floods and
// brute force that complements the audit log (ADR-24). Pure, in-memory,
// fixed-window counters keyed per rule+subject; a single-instance pilot
// doesn't need a shared store (noted as a follow-up for horizontal scale).

export interface RateCheck {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/** Fixed-window counter. `check` counts the current hit and says whether it
 *  stays within `limit` per `windowMs` for that key. Deterministic via now. */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, limit: number, windowMs: number): RateCheck {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || t >= b.resetAt) {
      b = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    this.pruneOccasionally(t);
    const remaining = Math.max(0, limit - b.count);
    return { allowed: b.count <= limit, remaining, resetInMs: Math.max(0, b.resetAt - t) };
  }

  /** Drop expired buckets now and then so the map can't grow unbounded. */
  private pruneOccasionally(t: number): void {
    if (this.buckets.size < 1000) return;
    for (const [k, v] of this.buckets) if (t >= v.resetAt) this.buckets.delete(k);
  }
}

export type RateSubject = 'ip' | 'phone';

export interface RateRule {
  name: string;
  test: (method: string, path: string) => boolean;
  limit: number;
  windowMs: number;
  /** Key by source IP, or by the request's phone (falls back to IP). */
  by: RateSubject;
}

const TEN_MIN = 10 * 60_000;

/**
 * The sensitive routes we throttle. OTP is keyed by phone (so one account
 * can't be hammered, and a shared NAT IP isn't collectively locked out);
 * the rest key by IP. Tuned for the pilot — override via env multipliers if
 * needed. No catch-all: unlisted routes are not limited.
 */
export const DEFAULT_RATE_RULES: RateRule[] = [
  { name: 'otp-request', test: (m, p) => m === 'POST' && p === '/auth/otp/request', limit: 5, windowMs: TEN_MIN, by: 'phone' },
  { name: 'otp-verify', test: (m, p) => m === 'POST' && p === '/auth/otp/verify', limit: 10, windowMs: TEN_MIN, by: 'phone' },
  { name: 'email-request', test: (m, p) => m === 'POST' && p === '/verification/email/request', limit: 5, windowMs: TEN_MIN, by: 'ip' },
  { name: 'kyc-authorize', test: (m, p) => m === 'POST' && p === '/verification/kyc/authorize', limit: 10, windowMs: TEN_MIN, by: 'ip' },
  {
    name: 'wallet-money',
    test: (m, p) => m === 'POST' && /^\/wallets\/[^/]+\/(topup|withdraw)$/.test(p),
    limit: 20,
    windowMs: TEN_MIN,
    by: 'ip',
  },
];

/** First rule matching the request, or null. */
export function matchRule(rules: RateRule[], method: string, path: string): RateRule | null {
  return rules.find((r) => r.test(method, path)) ?? null;
}
