import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { GroupStore } from '../src/api/group.store';
import { AuthStore } from '../src/auth/auth.store';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { runMigrations } from '../src/db/migrate';

const pkg = DAILY_PACKAGE;

async function setup() {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const store = new GroupStore(pool);
  await store.ensureDailyPackage(pkg);
  const users = new AuthStore(pool);
  return { store, users };
}

describe('GroupStore.joinPackage', () => {
  it('allocates two members into the same filling group', async () => {
    const { store, users } = await setup();
    const u1 = await users.findOrCreateUserByPhone('254700000001');
    const u2 = await users.findOrCreateUserByPhone('254700000002');

    const m1 = await store.joinPackage(u1, pkg);
    const m2 = await store.joinPackage(u2, pkg);

    expect(m1.groupId).toBe(m2.groupId);
    expect(m1.joinOrder).toBe(1);
    expect(m2.joinOrder).toBe(2);
  });

  it('puts a repeat join into a different group (never twice in one)', async () => {
    const { store, users } = await setup();
    const u1 = await users.findOrCreateUserByPhone('254700000001');
    const first = await store.joinPackage(u1, pkg);
    const second = await store.joinPackage(u1, pkg);
    expect(second.groupId).not.toBe(first.groupId);
  });

  it('exposes wallet ownership and membership', async () => {
    const { store, users } = await setup();
    const u1 = await users.findOrCreateUserByPhone('254700000001');
    const other = await users.findOrCreateUserByPhone('254700000009');
    const m1 = await store.joinPackage(u1, pkg);

    expect(await store.walletOwner(m1.walletId)).toBe(u1);
    expect(await store.walletOwner('no-such-wallet')).toBeNull();
    expect(await store.isMember(m1.groupId, u1)).toBe(true);
    expect(await store.isMember(m1.groupId, other)).toBe(false);
  });
});
