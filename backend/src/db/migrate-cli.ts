// CLI: apply migrations to the database in $DATABASE_URL.
//   DATABASE_URL=postgres://user:pass@host:5432/bobly npm run migrate
import { Pool } from 'pg';
import { runMigrations } from './migrate';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const ran = await runMigrations(pool);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations');
} finally {
  await pool.end();
}
