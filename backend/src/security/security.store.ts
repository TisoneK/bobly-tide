import type { Pool } from 'pg';

export type Severity = 'info' | 'warning' | 'critical';
export type SecurityEventType =
  | 'auth_failed'
  | 'admin_denied'
  | 'ownership_denied'
  | 'callback_rejected'
  | 'otp_locked'
  | 'rate_limited'
  | 'join_limit'
  | 'kyc_rejected'
  | 'anomaly_threshold';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: Severity;
  userId: string | null;
  phone: string | null;
  ip: string | null;
  detail: string | null;
  createdAt: string; // ISO
}

/** New-event payload (id + createdAt are assigned on record). */
export interface NewSecurityEvent {
  type: SecurityEventType;
  severity: Severity;
  userId?: string | null;
  phone?: string | null;
  ip?: string | null;
  detail?: string | null;
}

interface Row {
  id: string;
  type: string;
  severity: string;
  user_id: string | null;
  phone: string | null;
  ip: string | null;
  detail: string | null;
  created_at: string | Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Persistence for the security audit trail (ADR-24). */
export class SecurityStore {
  constructor(private readonly pool: Pool) {}

  async insert(e: SecurityEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO security_event (id, type, severity, user_id, phone, ip, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [e.id, e.type, e.severity, e.userId, e.phone, e.ip, e.detail, e.createdAt],
    );
  }

  /** Most recent events, optionally only at/above a severity. */
  async list(limit: number, minSeverity?: Severity): Promise<SecurityEvent[]> {
    const order: Severity[] = ['info', 'warning', 'critical'];
    const allowed = minSeverity ? order.slice(order.indexOf(minSeverity)) : order;
    // Expanded IN (...) rather than ANY($1) — pg-mem doesn't handle array params.
    const placeholders = allowed.map((_, i) => `$${i + 1}`).join(', ');
    const res = await this.pool.query<Row>(
      `SELECT * FROM security_event
       WHERE severity IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT $${allowed.length + 1}`,
      [...allowed, limit],
    );
    return res.rows.map(mapRow);
  }

  /** How many events of a type share the same IP (or phone) since `sinceIso` —
   *  the signal behind threshold alerting. */
  async countRecent(
    type: SecurityEventType,
    key: { ip?: string | null; phone?: string | null },
    sinceIso: string,
  ): Promise<number> {
    const col = key.ip != null ? 'ip' : 'phone';
    const val = key.ip != null ? key.ip : key.phone;
    if (val == null) return 0;
    const res = await this.pool.query<{ c: number | string }>(
      `SELECT count(*) AS c FROM security_event
       WHERE type = $1 AND ${col} = $2 AND created_at >= $3`,
      [type, val, sinceIso],
    );
    return Number(res.rows[0]?.c ?? 0);
  }
}

function mapRow(r: Row): SecurityEvent {
  return {
    id: r.id,
    type: r.type as SecurityEventType,
    severity: r.severity as Severity,
    userId: r.user_id,
    phone: r.phone,
    ip: r.ip,
    detail: r.detail,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Guard a value destined for the uuid user_id column. */
export function asUuidOrNull(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}
