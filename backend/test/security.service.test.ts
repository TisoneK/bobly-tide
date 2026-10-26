import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { type AlertSink, FakeAlertSink } from '../src/security/alert';
import { SecurityService } from '../src/security/security.service';
import { SecurityStore } from '../src/security/security.store';

async function setup(opts: { threshold?: number; windowMs?: number; alert?: AlertSink } = {}) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const store = new SecurityStore(pool);
  const alert = opts.alert ?? new FakeAlertSink();
  const svc = new SecurityService(store, alert, {
    alertWindowMs: opts.windowMs ?? 600_000,
    alertThreshold: opts.threshold ?? 3,
  });
  return { store, alert, svc };
}

describe('SecurityService', () => {
  it('persists every event and lets admins read them back', async () => {
    const { store, svc } = await setup();
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '1.1.1.1', detail: 'x' });
    const list = await store.list(10);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'auth_failed', severity: 'warning', ip: '1.1.1.1' });
  });

  it('alerts immediately on a critical event', async () => {
    const alert = new FakeAlertSink();
    const { svc } = await setup({ alert });
    await svc.record({ type: 'callback_rejected', severity: 'critical', ip: '9.9.9.9' });
    expect(alert.sent).toHaveLength(1);
    expect(alert.sent[0]).toMatchObject({ type: 'callback_rejected', severity: 'critical' });
  });

  it('escalates to an alert when a counted type repeats past the threshold', async () => {
    const alert = new FakeAlertSink();
    const { store, svc } = await setup({ threshold: 3, alert });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '2.2.2.2' });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '2.2.2.2' });
    expect(alert.sent).toHaveLength(0); // under threshold
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '2.2.2.2' });

    expect(alert.sent).toHaveLength(1);
    expect(alert.sent[0]).toMatchObject({ type: 'anomaly_threshold', severity: 'critical', ip: '2.2.2.2' });
    // The escalation is persisted alongside the three originals.
    const criticals = await store.list(10, 'critical');
    expect(criticals).toHaveLength(1);
    expect(criticals[0]!.type).toBe('anomaly_threshold');
  });

  it('counts per source — a different IP does not escalate', async () => {
    const alert = new FakeAlertSink();
    const { svc } = await setup({ threshold: 3, alert });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '3.3.3.3' });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '4.4.4.4' });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '5.5.5.5' });
    expect(alert.sent).toHaveLength(0);
  });

  it('does not escalate once the window has passed', async () => {
    const alert = new FakeAlertSink();
    const db = newDb();
    const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
    await runMigrations(pool);
    const store = new SecurityStore(pool);
    let t = Date.parse('2026-01-01T00:00:00Z');
    const svc = new SecurityService(store, alert, { alertWindowMs: 60_000, alertThreshold: 3 }, { now: () => t });
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '6.6.6.6' });
    t += 120_000; // past the window
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '6.6.6.6' });
    t += 1;
    await svc.record({ type: 'auth_failed', severity: 'warning', ip: '6.6.6.6' });
    expect(alert.sent).toHaveLength(0); // only 2 fall inside the window
  });

  it('never throws, even if the alert sink fails', async () => {
    const throwing: AlertSink = {
      send: () => Promise.reject(new Error('sink down')),
    };
    const { svc } = await setup({ alert: throwing });
    await expect(svc.record({ type: 'callback_rejected', severity: 'critical', ip: '7.7.7.7' })).resolves.toBeUndefined();
  });
});
