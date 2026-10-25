import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '../src/auth/auth.store';
import { runMigrations } from '../src/db/migrate';
import { FakeEmailSender, FakeKycProvider, type KycProvider } from '../src/verification/providers';
import { SmileIdKycProvider, type SmileConfig, smileSignature } from '../src/verification/smile';
import {
  KycVendorNotConfiguredError,
  VerificationService,
  type VerificationConfig,
} from '../src/verification/verification.service';
import { VerificationStore } from '../src/verification/verification.store';

const SMILE: SmileConfig = {
  partnerId: 'test-partner',
  apiKey: 'test-api-key',
  baseUrl: 'https://testapi.smileidentity.com/v1',
  callbackUrl: 'https://bobly.example/verification/callbacks/kyc',
  approvedCodes: new Set(['0810', '1012']),
};

const CONFIG: VerificationConfig = {
  secret: 'pepper',
  requiredKinds: ['email', 'id', 'face', 'address'],
  emailCodeTtlSec: 600,
  maxAttempts: 3,
};

/** A Smile ID result callback body signed with the given config. */
function signedCallback(opts: {
  jobId: string;
  resultCode: string;
  timestamp?: string;
  liveness?: string;
  resultText?: string;
}) {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  return {
    PartnerParams: { job_id: opts.jobId, user_id: 'u1' },
    ResultCode: opts.resultCode,
    ResultText: opts.resultText ?? 'done',
    Actions: opts.liveness ? { Liveness_Check: opts.liveness } : undefined,
    timestamp,
    signature: smileSignature(SMILE.apiKey, SMILE.partnerId, timestamp),
  };
}

describe('Smile ID — signature', () => {
  it('is deterministic for the same inputs and varies with the timestamp', () => {
    const ts = '2026-10-25T12:00:00.000Z';
    const a = smileSignature('k', 'p', ts);
    const b = smileSignature('k', 'p', ts);
    const c = smileSignature('k', 'p', '2026-10-25T12:00:01.000Z');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64
  });
});

describe('Smile ID — authorizeUpload', () => {
  it('signs the issued job with the current timestamp', () => {
    const p = new SmileIdKycProvider(SMILE);
    const auth = p.authorizeUpload('face', 'u1', 'job-1');
    expect(auth.jobId).toBe('job-1');
    expect(auth.product).toBe('biometric_kyc');
    expect(auth.signature).toBe(smileSignature(SMILE.apiKey, SMILE.partnerId, auth.timestamp));
    expect(auth.callbackUrl).toBe(SMILE.callbackUrl);
  });
});

describe('Smile ID — parseCallback', () => {
  const p = new SmileIdKycProvider(SMILE);

  it('approves an approved result code', () => {
    const res = p.parseCallback(signedCallback({ jobId: 'j1', resultCode: '1012' }));
    expect(res).toEqual({ providerRef: 'j1', decision: 'verified' });
  });

  it('rejects an unapproved result code with the result text as reason', () => {
    const res = p.parseCallback(signedCallback({ jobId: 'j1', resultCode: '0901', resultText: 'no match' }));
    expect(res?.decision).toBe('rejected');
    expect(res?.reason).toBe('no match');
  });

  it('rejects even an approved code when liveness failed', () => {
    const res = p.parseCallback(signedCallback({ jobId: 'j1', resultCode: '1012', liveness: 'Failed' }));
    expect(res?.decision).toBe('rejected');
  });

  it('returns null on a bad signature (moves no state)', () => {
    const body = signedCallback({ jobId: 'j1', resultCode: '1012' });
    body.signature = 'tampered';
    expect(p.parseCallback(body)).toBeNull();
  });

  it('returns null when the job id is missing', () => {
    const ts = '2026-10-25T12:00:00.000Z';
    const body = { ResultCode: '1012', timestamp: ts, signature: smileSignature(SMILE.apiKey, SMILE.partnerId, ts) };
    expect(p.parseCallback(body)).toBeNull();
  });
});

async function setup(kyc: KycProvider) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const userId = await new AuthStore(pool).findOrCreateUserByPhone('254700000001');
  const svc = new VerificationService(new VerificationStore(pool), new FakeEmailSender(), kyc, CONFIG);
  return { svc, userId };
}

describe('VerificationService — async KYC vendor', () => {
  it('authorizes an upload, then resolves the pending item from a signed callback', async () => {
    const { svc, userId } = await setup(new SmileIdKycProvider(SMILE));

    const auth = await svc.authorizeKyc(userId, 'face');
    expect((await svc.status(userId)).items.face).toBe('pending');

    const res = await svc.resolveKycCallback(signedCallback({ jobId: auth.jobId, resultCode: '1012' }));
    expect(res).toEqual({ matched: true, decision: 'verified' });
    expect((await svc.status(userId)).items.face).toBe('verified');
  });

  it('is idempotent — a repeat callback does not re-resolve', async () => {
    const { svc, userId } = await setup(new SmileIdKycProvider(SMILE));
    const auth = await svc.authorizeKyc(userId, 'id');
    const cb = signedCallback({ jobId: auth.jobId, resultCode: '0901', resultText: 'rejected' });
    await svc.resolveKycCallback(cb);
    expect((await svc.status(userId)).items.id).toBe('rejected');
    // A second delivery matches the (now resolved) job but changes nothing.
    const again = await svc.resolveKycCallback(cb);
    expect(again.matched).toBe(true);
    expect((await svc.status(userId)).items.id).toBe('rejected');
  });

  it('ignores an unmatched callback', async () => {
    const { svc } = await setup(new SmileIdKycProvider(SMILE));
    const res = await svc.resolveKycCallback(signedCallback({ jobId: 'no-such-job', resultCode: '1012' }));
    expect(res).toEqual({ matched: false });
  });

  it('rejects authorize when no async vendor is configured (fake provider)', async () => {
    const { svc, userId } = await setup(new FakeKycProvider(false));
    await expect(svc.authorizeKyc(userId, 'face')).rejects.toBeInstanceOf(KycVendorNotConfiguredError);
  });
});
