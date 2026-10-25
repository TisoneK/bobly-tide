import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '../src/auth/auth.store';
import { runMigrations } from '../src/db/migrate';
import { FakeEmailSender, FakeKycProvider } from '../src/verification/providers';
import {
  InvalidEmailCodeError,
  VerificationRequiredError,
  VerificationService,
  type VerificationConfig,
} from '../src/verification/verification.service';
import { VerificationStore } from '../src/verification/verification.store';

const CONFIG: VerificationConfig = {
  secret: 'pepper',
  requiredKinds: ['email', 'id', 'face', 'address'],
  emailCodeTtlSec: 600,
  maxAttempts: 3,
};

async function setup(opts: { autoApprove?: boolean; now?: () => number } = {}) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const users = new AuthStore(pool);
  const userId = await users.findOrCreateUserByPhone('254700000001');
  const email = new FakeEmailSender();
  const kyc = new FakeKycProvider(opts.autoApprove ?? true);
  const svc = new VerificationService(new VerificationStore(pool), email, kyc, CONFIG, opts.now ? { now: opts.now } : {});
  return { svc, email, userId };
}

describe('VerificationService — email', () => {
  it('verifies an email with the emailed code', async () => {
    const { svc, email, userId } = await setup();
    await svc.startEmail(userId, 'a@b.com');
    await svc.confirmEmail(userId, email.codeFor('a@b.com')!);
    expect((await svc.status(userId)).items.email).toBe('verified');
  });

  it('rejects a wrong code', async () => {
    const { svc, email, userId } = await setup();
    await svc.startEmail(userId, 'a@b.com');
    const real = email.codeFor('a@b.com')!;
    const wrong = real === '000000' ? '000001' : '000000';
    await expect(svc.confirmEmail(userId, wrong)).rejects.toBeInstanceOf(InvalidEmailCodeError);
  });
});

describe('VerificationService — documents', () => {
  it('auto-verifies submissions when the provider approves', async () => {
    const { svc, userId } = await setup({ autoApprove: true });
    expect(await svc.submit(userId, 'id', 'doc-ref')).toBe('verified');
    expect((await svc.status(userId)).items.id).toBe('verified');
  });

  it('leaves submissions pending when the provider does not approve', async () => {
    const { svc, userId } = await setup({ autoApprove: false });
    expect(await svc.submit(userId, 'id', 'doc-ref')).toBe('pending');
    expect((await svc.status(userId)).items.id).toBe('pending');
  });

  it('an ops review resolves a pending submission', async () => {
    const { svc, userId } = await setup({ autoApprove: false });
    await svc.submit(userId, 'id', 'doc-ref');
    await svc.review(userId, 'id', 'verified');
    expect((await svc.status(userId)).items.id).toBe('verified');

    await svc.submit(userId, 'face', 'selfie-ref');
    await svc.review(userId, 'face', 'rejected', 'blurry');
    expect((await svc.status(userId)).items.face).toBe('rejected');
  });
});

describe('VerificationService — gating', () => {
  it('blocks until every required item is verified, then allows', async () => {
    const { svc, email, userId } = await setup({ autoApprove: true });

    await expect(svc.requireVerified(userId)).rejects.toBeInstanceOf(VerificationRequiredError);
    expect((await svc.status(userId)).missing.sort()).toEqual(['address', 'email', 'face', 'id']);

    await svc.startEmail(userId, 'a@b.com');
    await svc.confirmEmail(userId, email.codeFor('a@b.com')!);
    await svc.submit(userId, 'id', 'id-ref');
    await svc.submit(userId, 'face', 'selfie-ref');
    await svc.submit(userId, 'address', 'bill-ref');

    const status = await svc.status(userId);
    expect(status.verified).toBe(true);
    expect(status.missing).toEqual([]);
    await expect(svc.requireVerified(userId)).resolves.toBeUndefined();
  });
});
