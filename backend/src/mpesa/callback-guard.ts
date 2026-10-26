// Source validation for M-Pesa Daraja callbacks (ADR-22). Daraja does not
// sign its callbacks, so the two defences are: a secret segment embedded in
// the callback URL we register with Daraja (only Safaricom and we know it),
// and an allowlist of Safaricom's source IPs. Both are optional and off by
// default (dev / the fake client); either or both can be enabled in prod.
//
// This module is pure and unit-tested; the controller reads the request's
// token (from the path) and source IP and calls verifyCallbackSource.

import { timingSafeEqual } from 'node:crypto';

export interface CallbackSourceConfig {
  /** Secret path segment in the registered callback URL; '' disables the check. */
  secret: string;
  /** Allowed source IPs / IPv4 CIDRs (Safaricom's Daraja ranges); [] disables. */
  allowedIps: string[];
}

export interface CallbackSource {
  token?: string | undefined;
  ip?: string | undefined;
}

export type CallbackCheck = { ok: true } | { ok: false; reason: string };

export function verifyCallbackSource(cfg: CallbackSourceConfig, src: CallbackSource): CallbackCheck {
  if (cfg.secret) {
    if (!src.token || !safeEqual(src.token, cfg.secret)) {
      return { ok: false, reason: 'invalid callback token' };
    }
  }
  if (cfg.allowedIps.length > 0) {
    const ip = normalizeIp(src.ip);
    if (!ip || !cfg.allowedIps.some((a) => ipMatches(ip, a))) {
      return { ok: false, reason: 'source IP not allowed' };
    }
  }
  return { ok: true };
}

/** Constant-time string compare (equal length required). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Strip an IPv4-mapped IPv6 prefix (::ffff:196.1.2.3 → 196.1.2.3). */
export function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return m ? m[1]! : ip;
}

/** Exact IP match, or IPv4 CIDR (a.b.c.d/n) containment. */
export function ipMatches(ip: string, allowed: string): boolean {
  if (!allowed.includes('/')) return ip === normalizeIp(allowed);
  const [range, bitsStr] = allowed.split('/');
  const bits = Number(bitsStr);
  const ipN = ipv4ToInt(ip);
  const rangeN = ipv4ToInt(range ?? '');
  if (ipN == null || rangeN == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipN & mask) === (rangeN & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const o = Number(p);
    if (o < 0 || o > 255) return null;
    n = ((n << 8) | o) >>> 0;
  }
  return n >>> 0;
}
