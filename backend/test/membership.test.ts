import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { describe, expect, it } from 'vitest';
import { GroupStore, JoinLimitReachedError } from '../src/api/group.store';
import { AuthStore } from '../src/auth/auth.store';
import { DAILY_PACKAGE } from '../src/domain/packages';
import { runMigrations } from '../src/db/migrate';

const pkg = DAILY_PACKAGE;

async function setup(maxActiveGroups?: number) {
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)() as unknown as Pool;
  await runMigrations(pool);
  const store = new GroupStore(pool, maxActiveGroups);
  await store.ensureDailyPackage(pkg);
  const users = new AuthStore(pool);
  return { store, users, pool };
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

describe('GroupStore — per-user join limit (§8.5)', () => {
  it('blocks a join once the user is in the maximum active groups', async () => {
    const { store, users } = await setup(2);
    const u = await users.findOrCreateUserByPhone('254700000001');
    await store.joinPackage(u, pkg);
    await store.joinPackage(u, pkg);
    expect(await store.countActiveMemberships(u)).toBe(2);
    await expect(store.joinPackage(u, pkg)).rejects.toBeInstanceOf(JoinLimitReachedError);
  });

  it('frees a slot when a membership completes or is left', async () => {
    const { store, users } = await setup(2);
    const u = await users.findOrCreateUserByPhone('254700000001');
    const m1 = await store.joinPackage(u, pkg);
    await store.joinPackage(u, pkg);
    await expect(store.joinPackage(u, pkg)).rejects.toBeInstanceOf(JoinLimitReachedError);

    await store.setMembershipState(m1.id, 'left');
    expect(await store.countActiveMemberships(u)).toBe(1);
    await expect(store.joinPackage(u, pkg)).resolves.toBeDefined(); // slot freed
  });

  it('does not count another user against your limit', async () => {
    const { store, users } = await setup(1);
    const u1 = await users.findOrCreateUserByPhone('254700000001');
    const u2 = await users.findOrCreateUserByPhone('254700000002');
    await store.joinPackage(u1, pkg);
    // u2 is unaffected by u1 being at their limit.
    await expect(store.joinPackage(u2, pkg)).resolves.toBeDefined();
    await expect(store.joinPackage(u1, pkg)).rejects.toBeInstanceOf(JoinLimitReachedError);
  });

  it('disables the cap when the limit is 0', async () => {
    const { store, users } = await setup(0);
    const u = await users.findOrCreateUserByPhone('254700000001');
    for (let i = 0; i < 4; i++) await store.joinPackage(u, pkg);
    expect(await store.countActiveMemberships(u)).toBe(4);
  });
});
