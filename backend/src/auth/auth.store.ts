import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface OtpRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  consumed: boolean;
  attempts: number;
}

interface OtpRow {
  id: string;
  phone: string;
  code_hash: string;
  expires_at: string | Date;
  consumed: boolean;
  attempts: number | string;
}

/** Persistence for OTP codes and the phone→user mapping (build spec §8). */
export class AuthStore {
  constructor(private readonly pool: Pool) {}

  async createOtp(rec: { id: string; phone: string; codeHash: string; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      `INSERT INTO otp_code (id, phone, code_hash, expires_at, consumed, attempts, created_at)
       VALUES ($1, $2, $3, $4, false, 0, $5)`,
      [rec.id, rec.phone, rec.codeHash, rec.expiresAt.toISOString(), new Date().toISOString()],
    );
  }

  /** Most recent code issued for a phone (validity is checked in the service). */
  async latestOtp(phone: string): Promise<OtpRecord | null> {
    const res = await this.pool.query<OtpRow>(
      'SELECT * FROM otp_code WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
      [phone],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      phone: r.phone,
      codeHash: r.code_hash,
      expiresAt: new Date(r.expires_at),
      consumed: r.consumed,
      attempts: Number(r.attempts),
    };
  }

  async consumeOtp(id: string): Promise<void> {
    await this.pool.query('UPDATE otp_code SET consumed = true WHERE id = $1', [id]);
  }

  async bumpAttempts(id: string): Promise<void> {
    await this.pool.query('UPDATE otp_code SET attempts = attempts + 1 WHERE id = $1', [id]);
  }

  /** Set the member's chosen first name (shown in the turn order). */
  async setDisplayName(userId: string, displayName: string): Promise<void> {
    await this.pool.query('UPDATE app_user SET display_name = $1 WHERE id = $2', [displayName, userId]);
  }

  /** Return the user id for a phone, creating the account on first sight. */
  async findOrCreateUserByPhone(phone: string): Promise<string> {
    const found = await this.pool.query<{ id: string }>('SELECT id FROM app_user WHERE phone = $1', [phone]);
    if (found.rows[0]) return found.rows[0].id;

    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO app_user (id, phone, kyc_level, status, created_at)
       VALUES ($1, $2, 'phone', 'active', $3)`,
      [id, phone, new Date().toISOString()],
    );
    return id;
  }
}
