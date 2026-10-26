import { randomUUID } from 'node:crypto';
import type { AlertSink } from './alert';
import {
  asUuidOrNull,
  type NewSecurityEvent,
  type SecurityEvent,
  type SecurityEventType,
  type SecurityStore,
} from './security.store';

export interface SecurityConfig {
  /** Window for counting repeats of the same event from one source. */
  alertWindowMs: number;
  /** Repeats of a counted type within the window that escalate to an alert. */
  alertThreshold: number;
}

export interface SecurityDeps {
  now?: () => number;
}

/** Event types whose repetition from one source is itself suspicious. */
const COUNTED: SecurityEventType[] = ['auth_failed', 'callback_rejected', 'ownership_denied', 'otp_locked'];

/**
 * Central recorder for the security audit trail (ADR-24). Every record is
 * persisted; a `critical` event alerts immediately, and a burst of a counted
 * type from one IP/phone within the window escalates to a `critical`
 * `anomaly_threshold` event and alerts. Recording never throws — security
 * logging must not break the request path.
 */
export class SecurityService {
  private readonly now: () => number;

  constructor(
    private readonly store: SecurityStore,
    private readonly alert: AlertSink,
    private readonly config: SecurityConfig,
    deps: SecurityDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
  }

  async record(e: NewSecurityEvent): Promise<void> {
    try {
      const event: SecurityEvent = {
        id: randomUUID(),
        type: e.type,
        severity: e.severity,
        userId: asUuidOrNull(e.userId),
        phone: e.phone ?? null,
        ip: e.ip ?? null,
        detail: e.detail ?? null,
        createdAt: new Date(this.now()).toISOString(),
      };
      await this.store.insert(event);

      if (event.severity === 'critical') {
        await this.safeAlert(event);
        return;
      }
      if (COUNTED.includes(event.type) && (event.ip || event.phone)) {
        await this.maybeEscalate(event);
      }
    } catch (err) {
      // Never let audit logging break the request it describes.
      console.error('[security] failed to record event', (err as Error).message);
    }
  }

  private async maybeEscalate(event: SecurityEvent): Promise<void> {
    const sinceIso = new Date(this.now() - this.config.alertWindowMs).toISOString();
    const key = event.ip ? { ip: event.ip } : { phone: event.phone };
    const count = await this.store.countRecent(event.type, key, sinceIso);
    if (count < this.config.alertThreshold) return;

    const escalation: SecurityEvent = {
      id: randomUUID(),
      type: 'anomaly_threshold',
      severity: 'critical',
      userId: event.userId,
      phone: event.phone,
      ip: event.ip,
      detail: `${count} ${event.type} events from ${event.ip ?? event.phone} within ${Math.round(
        this.config.alertWindowMs / 1000,
      )}s`,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.store.insert(escalation);
    await this.safeAlert(escalation);
  }

  private async safeAlert(event: SecurityEvent): Promise<void> {
    try {
      await this.alert.send(event);
    } catch (err) {
      console.error('[security] alert sink failed', (err as Error).message);
    }
  }
}
