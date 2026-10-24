import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
// src/db -> ../../db/migrations
export const MIGRATIONS_DIR = join(here, '..', '..', 'db', 'migrations');

/**
 * Apply any unapplied `db/migrations/*.sql` files in filename order, each in
 * its own transaction, recording applied versions in `schema_migrations`.
 * Idempotent: already-applied migrations are skipped.
 */
export async function runMigrations(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  // Create the tracking table only when absent. We probe with a SELECT
  // rather than `CREATE TABLE IF NOT EXISTS` because a re-run of that form
  // trips a pg-mem limitation; the probe behaves the same on real Postgres.
  try {
    await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  } catch {
    await pool.query(
      `CREATE TABLE schema_migrations (
         version    TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL
       )`,
    );
  }

  const applied = new Set<string>(
    (await pool.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
        version,
        new Date().toISOString(),
      ]);
      await client.query('COMMIT');
      ran.push(version);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${version} failed: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  return ran;
}
