import type { Pool } from 'pg';

export type VerificationKind = 'email' | 'id' | 'face' | 'address';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface VerificationItem {
  kind: VerificationKind;
  status: VerificationStatus;
  detail: string | null;
}

export interface EmailCode {
  id: string;
  codeHash: string;
  email: string;
  expiresAt: Date;
  consumed: boolean;
  attempts: number;
}

interface VRow {
  kind: string;
  status: string;
  detail: string | null;
}
interface ECRow {
  id: string;
  code_hash: string;
  email: string;
  expires_at: string | Date;
  consumed: boolean;
  attempts: number | string;
}

/** Persistence for verification items and email confirmation codes. */
export class VerificationStore {
  constructor(private readonly pool: Pool) {}

  /** All submissions awaiting a decision, for ops review. */
  async listPending(): Promise<{ userId: string; phone: string; kind: VerificationKind; detail: string | null; updatedAt: string }[]> {
    const res = await this.pool.query<{
      user_id: string;
      phone: string;
      kind: string;
      detail: string | null;
      updated_at: string | Date;
    }>(
      `SELECT v.user_id, u.phone, v.kind, v.detail, v.updated_at
       FROM verification v JOIN app_user u ON u.id = v.user_id
       WHERE v.status = 'pending'
       ORDER BY v.updated_at`,
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      phone: r.phone,
      kind: r.kind as VerificationKind,
      detail: r.detail,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async list(userId: string): Promise<VerificationItem[]> {
    const res = await this.pool.query<VRow>(
      'SELECT kind, status, detail FROM verification WHERE user_id = $1',
      [userId],
    );
    return res.rows.map((r) => ({
      kind: r.kind as VerificationKind,
      status: r.status as VerificationStatus,
      detail: r.detail,
    }));
  }

  /** Insert or update one verification item for a user. */
  async upsert(
    userId: string,
    kind: VerificationKind,
    status: VerificationStatus,
    detail: string | null,
    idGen: () => string,
  ): Promise<void> {
    const existing = await this.pool.query('SELECT 1 FROM verification WHERE user_id = $1 AND kind = $2', [
      userId,
      kind,
    ]);
    const now = new Date().toISOString();
    if (existing.rowCount && existing.rowCount > 0) {
      await this.pool.query(
        'UPDATE verification SET status = $1, detail = $2, updated_at = $3 WHERE user_id = $4 AND kind = $5',
        [status, detail, now, userId, kind],
      );
    } else {
      await this.pool.query(
        'INSERT INTO verification (id, user_id, kind, status, detail, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [idGen(), userId, kind, status, detail, now],
      );
    }
  }

  async createEmailCode(rec: {
    id: string;
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO email_code (id, user_id, email, code_hash, expires_at, consumed, attempts, created_at)
       VALUES ($1, $2, $3, $4, $5, false, 0, $6)`,
      [rec.id, rec.userId, rec.email, rec.codeHash, rec.expiresAt.toISOString(), new Date().toISOString()],
    );
  }

  async latestEmailCode(userId: string): Promise<EmailCode | null> {
    const res = await this.pool.query<ECRow>(
      'SELECT * FROM email_code WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      codeHash: r.code_hash,
      email: r.email,
      expiresAt: new Date(r.expires_at),
      consumed: r.consumed,
      attempts: Number(r.attempts),
    };
  }

  async consumeEmailCode(id: string): Promise<void> {
    await this.pool.query('UPDATE email_code SET consumed = true WHERE id = $1', [id]);
  }

  async bumpEmailAttempts(id: string): Promise<void> {
    await this.pool.query('UPDATE email_code SET attempts = attempts + 1 WHERE id = $1', [id]);
  }
}
