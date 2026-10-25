// SMS delivery. The auth service depends on the SmsSender interface; the
// concrete provider (Africa's Talking or similar — build spec §13-D6) is
// wired later. FakeSmsSender serves tests and credential-less local dev.

export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

/** Records sent messages instead of delivering them. */
export class FakeSmsSender implements SmsSender {
  readonly sent: { to: string; body: string }[] = [];

  async send(to: string, body: string): Promise<void> {
    this.sent.push({ to, body });
  }

  /** The 6-digit code from the most recent message to `phone`, for tests. */
  codeFor(phone: string): string | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]!;
      if (m.to === phone) return m.body.match(/\b(\d{6})\b/)?.[1] ?? null;
    }
    return null;
  }
}

/** Logs the message — a stand-in for a real provider in local dev. */
export class LogSmsSender implements SmsSender {
  async send(to: string, body: string): Promise<void> {
    console.log(`[sms] ${to}: ${body}`);
  }
}
