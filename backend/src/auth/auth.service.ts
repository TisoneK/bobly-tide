import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { AuthStore } from './auth.store';
import { signJwt } from './jwt';
import type { SmsSender } from './sms';

export class InvalidOtpError extends Error {
  constructor() {
    super('invalid or expired code');
    this.name = 'InvalidOtpError';
  }
}
export class OtpLockedError extends Error {
  constructor() {
    super('too many attempts; request a new code');
    this.name = 'OtpLockedError';
  }
}

export interface AuthConfig {
  jwtSecret: string;
  otpTtlSec: number; // code lifetime (e.g. 300)
  tokenTtlSec: number; // session token lifetime (e.g. 86400)
  maxAttempts: number; // verify attempts before a code locks
}

export interface AuthDeps {
  /** Injected for deterministic tests. */
  codeGen?: () => string;
  now?: () => number;
}

export interface SessionToken {
  token: string;
  userId: string;
}

export interface SessionClaims {
  sub: string; // userId
  phone: string;
}

/**
 * Phone + one-time-code authentication (build spec §8). Codes are stored
 * hashed, expire quickly, are single-use, and lock after too many wrong
 * attempts. A verified phone maps to an app_user and gets a signed session
 * token.
 */
export class AuthService {
  private readonly codeGen: () => string;
  private readonly now: () => number;

  constructor(
    private readonly store: AuthStore,
    private readonly sms: SmsSender,
    private readonly config: AuthConfig,
    deps: AuthDeps = {},
  ) {
    this.codeGen = deps.codeGen ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
    this.now = deps.now ?? Date.now;
  }

  private hash(code: string, phone: string): string {
    return createHash('sha256').update(`${code}:${phone}:${this.config.jwtSecret}`).digest('hex');
  }

  async requestOtp(phone: string): Promise<void> {
    const code = this.codeGen();
    const expiresAt = new Date(this.now() + this.config.otpTtlSec * 1000);
    await this.store.createOtp({ id: randomUUID(), phone, codeHash: this.hash(code, phone), expiresAt });
    const minutes = Math.round(this.config.otpTtlSec / 60);
    await this.sms.send(phone, `Your Bobly Tide code is ${code}. It expires in ${minutes} minutes.`);
  }

  /** Set the member's display (first) name. */
  async setProfile(userId: string, displayName: string): Promise<void> {
    await this.store.setDisplayName(userId, displayName);
  }

  async verifyOtp(phone: string, code: string): Promise<SessionToken> {
    const otp = await this.store.latestOtp(phone);
    if (!otp || otp.consumed) throw new InvalidOtpError();
    if (otp.attempts >= this.config.maxAttempts) throw new OtpLockedError();
    if (otp.expiresAt.getTime() <= this.now()) throw new InvalidOtpError();

    if (this.hash(code, phone) !== otp.codeHash) {
      await this.store.bumpAttempts(otp.id);
      throw new InvalidOtpError();
    }

    await this.store.consumeOtp(otp.id);
    const userId = await this.store.findOrCreateUserByPhone(phone);
    const token = signJwt({ sub: userId, phone } satisfies SessionClaims, this.config.jwtSecret, this.config.tokenTtlSec, this.now);
    return { token, userId };
  }
}
