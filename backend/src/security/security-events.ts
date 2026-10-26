import type { Severity, SecurityEventType } from './security.store';

export interface Classified {
  type: SecurityEventType;
  severity: Severity;
}

/**
 * Map a rejected HTTP response to a security event, or null when it isn't
 * security-relevant (a plain 404, validation 400, benign 409, 500, or the
 * "verify to continue" 403 a normal user hits). Pure and unit-tested, so the
 * global filter stays a thin wiring layer (ADR-24).
 */
export function classifyRejection(status: number, message: string): Classified | null {
  const m = message.toLowerCase();

  if (status === 401) return { type: 'auth_failed', severity: 'warning' };

  if (status === 403) {
    if (m.includes('admin access only')) return { type: 'admin_denied', severity: 'warning' };
    if (m.includes('callback token') || m.includes('source ip not allowed')) {
      // Someone is forging payment callbacks — treat as critical.
      return { type: 'callback_rejected', severity: 'critical' };
    }
    if (m.includes('not yours') || m.includes('not a member')) {
      return { type: 'ownership_denied', severity: 'warning' };
    }
    // "verification required: ..." is a normal pre-KYC user, not an attack.
    return null;
  }

  if (status === 429) return { type: 'otp_locked', severity: 'warning' };

  // The join-limit 409 has a distinctive message; other 409s are benign.
  if (status === 409 && /at most \d+ active group/.test(m)) {
    return { type: 'join_limit', severity: 'warning' };
  }

  return null;
}
