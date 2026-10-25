import { createHmac, timingSafeEqual } from 'node:crypto';

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Minimal HS256 JWT — enough for session tokens, no external dependency. */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  ttlSec: number,
  now: () => number = Date.now,
): string {
  const iat = Math.floor(now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat, exp: iat + ttlSec })).toString('base64url');
  return `${header}.${body}.${sign(`${header}.${body}`, secret)}`;
}

export function verifyJwt<T = Record<string, unknown>>(
  token: string,
  secret: string,
  now: () => number = Date.now,
): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed token');
  const [header, body, sig] = parts as [string, string, string];
  if (!safeEqual(sig, sign(`${header}.${body}`, secret))) throw new JwtError('bad signature');

  let claims: { exp?: number };
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    throw new JwtError('bad payload');
  }
  if (typeof claims.exp === 'number' && Math.floor(now() / 1000) >= claims.exp) {
    throw new JwtError('token expired');
  }
  return claims as T;
}
