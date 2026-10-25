// Smile ID KYC provider. Implements the async-vendor shape of KycProvider:
//  - authorizeUpload: issues a signed job the client SDK uses to upload the
//    selfie / ID document and run a liveness check straight to Smile ID;
//  - parseCallback: verifies and interprets the result callback Smile ID
//    POSTs back, mapping it to verified / rejected.
//
// Images never touch our server — only the signed authorization and the
// result callback do. No secret values live in code: the API key comes from
// config (env / the deploy secret store). Implemented per the Smile ID v2
// docs; exercised against the sandbox, not by the unit suite (the signature
// maths and result mapping ARE unit-tested).

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  KycCallbackResolution,
  KycKind,
  KycProvider,
  KycResult,
  KycUploadAuth,
} from './providers';

export interface SmileConfig {
  partnerId: string;
  apiKey: string;
  /** Sandbox: https://testapi.smileidentity.com/v1 — production differs. */
  baseUrl: string;
  /** Where Smile ID POSTs the result callback. */
  callbackUrl: string;
  /**
   * Result codes Smile ID returns that we treat as approved. Defaults cover
   * the common success codes for document verification + biometric KYC; tune
   * per the products you enable (env `SMILE_APPROVED_CODES`).
   */
  approvedCodes: Set<string>;
}

/** The Smile ID product run for each of our KYC kinds. */
const PRODUCT: Record<KycKind, string> = {
  id: 'doc_verification', // document authenticity + selfie-to-ID compare
  face: 'biometric_kyc', // SmartSelfie + liveness
  address: 'doc_verification',
};

/** Smile ID v2 signature: base64(HMAC-SHA256(apiKey, timestamp+partnerId+"sid_request")). */
export function smileSignature(apiKey: string, partnerId: string, timestamp: string): string {
  return createHmac('sha256', apiKey)
    .update(timestamp)
    .update(partnerId)
    .update('sid_request')
    .digest('base64');
}

interface SmileCallbackBody {
  job_id?: string;
  PartnerParams?: { job_id?: string; user_id?: string };
  ResultCode?: string | number;
  ResultText?: string;
  Actions?: Record<string, string>;
  timestamp?: string;
  signature?: string;
}

/** Liveness must not have failed, when the vendor reports on it. */
function livenessOk(actions: Record<string, string> | undefined): boolean {
  const l = actions?.['Liveness_Check'];
  return l == null || l.toLowerCase() !== 'failed';
}

export class SmileIdKycProvider implements KycProvider {
  constructor(private readonly config: SmileConfig) {}

  /** Submitting through /verification/submit alone can't drive Smile (the
   *  client SDK uploads the media), so a plain submit stays `pending` for the
   *  authorize+callback flow (or an ops decision) to resolve. */
  async review(_kind: KycKind, _userId: string, _reference: string): Promise<KycResult> {
    return { decision: 'pending' };
  }

  /** Authorize a client-SDK upload + liveness run for this job. */
  authorizeUpload(kind: KycKind, userId: string, jobId: string): KycUploadAuth {
    const timestamp = new Date().toISOString();
    return {
      jobId,
      userId,
      kind,
      partnerId: this.config.partnerId,
      timestamp,
      signature: smileSignature(this.config.apiKey, this.config.partnerId, timestamp),
      callbackUrl: this.config.callbackUrl,
      baseUrl: this.config.baseUrl,
      product: PRODUCT[kind],
    };
  }

  /** Verify the callback signature, then map the result to verified/rejected.
   *  Returns null when the payload is unusable or the signature is invalid —
   *  the caller then resolves nothing (an unsigned callback can't move state). */
  parseCallback(payload: unknown): KycCallbackResolution | null {
    const body = (payload ?? {}) as SmileCallbackBody;
    const providerRef = body.PartnerParams?.job_id ?? body.job_id;
    if (!providerRef || !body.timestamp || !body.signature) return null;
    if (!this.verifySignature(body.timestamp, body.signature)) return null;

    const code = String(body.ResultCode ?? '');
    const approved = this.config.approvedCodes.has(code) && livenessOk(body.Actions);
    return approved
      ? { providerRef, decision: 'verified' }
      : { providerRef, decision: 'rejected', reason: body.ResultText || `result ${code || 'unknown'}` };
  }

  private verifySignature(timestamp: string, provided: string): boolean {
    const expected = smileSignature(this.config.apiKey, this.config.partnerId, timestamp);
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    // timingSafeEqual throws on length mismatch — guard first.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** A fresh vendor job id for a new submission. */
  static newJobId(kind: KycKind): string {
    return `bt-${kind}-${randomUUID()}`;
  }
}
