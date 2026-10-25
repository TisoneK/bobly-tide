import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  type EmailSender,
  type KycKind,
  type KycProvider,
} from './providers';
import {
  type VerificationItem,
  type VerificationKind,
  type VerificationStatus,
  type VerificationStore,
} from './verification.store';

export class InvalidEmailCodeError extends Error {
  constructor() {
    super('invalid or expired email code');
    this.name = 'InvalidEmailCodeError';
  }
}

/** A gated action was attempted before the required verification was complete. */
export class VerificationRequiredError extends Error {
  constructor(public readonly missing: VerificationKind[]) {
    super(`verification required: ${missing.join(', ')}`);
    this.name = 'VerificationRequiredError';
  }
}

export interface VerificationConfig {
  secret: string; // pepper for hashing email codes
  /** Items that must be `verified` to pass the gate. */
  requiredKinds: VerificationKind[];
  emailCodeTtlSec: number;
  maxAttempts: number;
}

export interface VerificationDeps {
  codeGen?: () => string;
  now?: () => number;
}

export interface VerificationStatusView {
  items: Record<VerificationKind, VerificationStatus>;
  required: VerificationKind[];
  missing: VerificationKind[];
  verified: boolean;
}

const ALL_KINDS: VerificationKind[] = ['email', 'id', 'face', 'address'];

/**
 * Tiered KYC (build spec §6). Email is self-service via a code; id/face/
 * address go through a KYC provider. A user is "verified" once every
 * required item is `verified`; gated actions check this.
 */
export class VerificationService {
  private readonly codeGen: () => string;
  private readonly now: () => number;

  constructor(
    private readonly store: VerificationStore,
    private readonly email: EmailSender,
    private readonly kyc: KycProvider,
    private readonly config: VerificationConfig,
    deps: VerificationDeps = {},
  ) {
    this.codeGen = deps.codeGen ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
    this.now = deps.now ?? Date.now;
  }

  private hash(code: string, userId: string): string {
    return createHash('sha256').update(`${code}:${userId}:${this.config.secret}`).digest('hex');
  }

  async status(userId: string): Promise<VerificationStatusView> {
    const rows = await this.store.list(userId);
    const byKind = new Map(rows.map((r) => [r.kind, r.status]));
    const items = Object.fromEntries(
      ALL_KINDS.map((k) => [k, byKind.get(k) ?? 'unverified']),
    ) as Record<VerificationKind, VerificationStatus>;
    const missing = this.config.requiredKinds.filter((k) => items[k] !== 'verified');
    return { items, required: this.config.requiredKinds, missing, verified: missing.length === 0 };
  }

  /** Throw unless every required item is verified. */
  async requireVerified(userId: string): Promise<void> {
    const { missing } = await this.status(userId);
    if (missing.length > 0) throw new VerificationRequiredError(missing);
  }

  // --- email ---
  async startEmail(userId: string, email: string): Promise<void> {
    const code = this.codeGen();
    const expiresAt = new Date(this.now() + this.config.emailCodeTtlSec * 1000);
    await this.store.createEmailCode({ id: randomUUID(), userId, email, codeHash: this.hash(code, userId), expiresAt });
    await this.store.upsert(userId, 'email', 'pending', email, randomUUID);
    await this.email.send(email, 'Your Bobly Tide email code', `Your code is ${code}.`);
  }

  async confirmEmail(userId: string, code: string): Promise<void> {
    const rec = await this.store.latestEmailCode(userId);
    if (!rec || rec.consumed) throw new InvalidEmailCodeError();
    if (rec.attempts >= this.config.maxAttempts) throw new InvalidEmailCodeError();
    if (rec.expiresAt.getTime() <= this.now()) throw new InvalidEmailCodeError();
    if (this.hash(code, userId) !== rec.codeHash) {
      await this.store.bumpEmailAttempts(rec.id);
      throw new InvalidEmailCodeError();
    }
    await this.store.consumeEmailCode(rec.id);
    await this.store.upsert(userId, 'email', 'verified', rec.email, randomUUID);
  }

  // --- id / face / address ---
  async submit(userId: string, kind: KycKind, reference: string): Promise<VerificationStatus> {
    await this.store.upsert(userId, kind, 'pending', reference, randomUUID);
    const result = await this.kyc.review(kind, userId, reference);
    const detail = result.decision === 'rejected' ? (result.reason ?? 'rejected') : reference;
    await this.store.upsert(userId, kind, result.decision, detail, randomUUID);
    return result.decision;
  }
}
