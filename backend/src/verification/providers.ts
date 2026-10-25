// Verification providers. The service depends on these interfaces; concrete
// integrations (an email service, a KYC vendor such as Smile ID) are wired
// later. Fakes drive tests and credential-less local dev.

export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

/** Records emails instead of delivering them (test/dev). */
export class FakeEmailSender implements EmailSender {
  readonly sent: { to: string; subject: string; body: string }[] = [];
  async send(to: string, subject: string, body: string): Promise<void> {
    this.sent.push({ to, subject, body });
  }
  /** The 6-digit code from the most recent email to `address`, for tests. */
  codeFor(address: string): string | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.to === address) return m.body.match(/\b(\d{6})\b/)?.[1] ?? null;
    }
    return null;
  }
}

export class LogEmailSender implements EmailSender {
  async send(to: string, subject: string, _body: string): Promise<void> {
    console.log(`[email] ${to}: ${subject}`);
  }
}

export type KycKind = 'id' | 'face' | 'address';
export type KycDecision = 'verified' | 'pending' | 'rejected';
export interface KycResult {
  decision: KycDecision;
  reason?: string;
  /** A vendor job reference, when the provider resolves asynchronously. */
  providerRef?: string;
}

/**
 * What a client SDK needs to upload the selfie/document straight to the
 * vendor and start a liveness check: a signed, timestamped job authorization.
 * The images never pass through our server — only this authorization does.
 */
export interface KycUploadAuth {
  jobId: string;
  userId: string;
  kind: KycKind;
  partnerId: string;
  timestamp: string;
  signature: string;
  callbackUrl: string;
  baseUrl: string;
  /** The vendor product to run (e.g. biometric KYC with liveness). */
  product: string;
}

/** The outcome parsed from a verified async result callback. */
export interface KycCallbackResolution {
  providerRef: string; // the vendor job id — maps back to our kyc_job
  decision: 'verified' | 'rejected';
  reason?: string;
}

/**
 * Reviews a submitted document / selfie / proof. A real vendor returns
 * `pending` and resolves later via a callback; the pilot uses the fake.
 *
 * `authorizeUpload` and `parseCallback` are optional — a provider that works
 * synchronously (the fake) omits them; an async vendor (Smile ID) implements
 * both: one to authorize the client SDK's upload + liveness, the other to
 * verify and interpret the vendor's result callback.
 */
export interface KycProvider {
  review(kind: KycKind, userId: string, reference: string): Promise<KycResult>;
  authorizeUpload?(kind: KycKind, userId: string, jobId: string): KycUploadAuth;
  parseCallback?(payload: unknown): KycCallbackResolution | null;
}

/**
 * Pilot KYC provider. With `autoApprove` it verifies on submit (demos and
 * tests); otherwise it leaves submissions `pending` for a real reviewer —
 * the safe default, since auto-approving identity in production is unsafe.
 */
export class FakeKycProvider implements KycProvider {
  constructor(private readonly autoApprove: boolean) {}
  async review(_kind: KycKind, _userId: string, _reference: string): Promise<KycResult> {
    return { decision: this.autoApprove ? 'verified' : 'pending' };
  }
}
