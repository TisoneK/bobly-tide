// Where security alerts go. The service depends on the AlertSink interface;
// FakeAlertSink drives tests, LogAlertSink is the credential-less default, and
// WebhookAlertSink posts to an incident channel (Slack/PagerDuty/etc.). No
// secret values in code — the webhook URL comes from env.

import type { SecurityEvent } from './security.store';

export interface AlertSink {
  send(event: SecurityEvent): Promise<void>;
}

/** Records alerts in memory for assertions (tests). */
export class FakeAlertSink implements AlertSink {
  readonly sent: SecurityEvent[] = [];
  async send(event: SecurityEvent): Promise<void> {
    this.sent.push(event);
  }
}

/** Default when no channel is configured — logs to stderr. */
export class LogAlertSink implements AlertSink {
  async send(event: SecurityEvent): Promise<void> {
    console.error(`[security-alert] ${event.severity} ${event.type}: ${event.detail ?? ''} (ip=${event.ip ?? '?'})`);
  }
}

/** Posts a compact JSON alert to a webhook (not exercised by the unit suite). */
export class WebhookAlertSink implements AlertSink {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(event: SecurityEvent): Promise<void> {
    await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔐 Bobly Tide security: ${event.severity.toUpperCase()} ${event.type}`,
        event: {
          type: event.type,
          severity: event.severity,
          ip: event.ip,
          phone: event.phone,
          detail: event.detail,
          at: event.createdAt,
        },
      }),
    });
  }
}
