import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Group, Membership, Package } from '../domain/types';

// One fixed package row for the pilot's single Daily package. The engine
// uses the DAILY_PACKAGE constant for its maths; this id only ties group
// rows to a package row in the schema.
export const DAILY_PACKAGE_DB_ID = '00000000-0000-0000-0000-0000000000da';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Guard before comparing a value against a `uuid` column — Postgres errors
 *  on malformed uuid syntax, so a bad path param must be treated as absent. */
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export interface LoadedGroup {
  group: Group;
  memberships: Membership[];
  startAt: Date | null;
}

/** A member row for the group view — name + masked phone, never the full
 *  number (ADR-14). */
export interface MemberView {
  userId: string;
  joinOrder: number;
  turnPosition: number | null;
  state: string;
  firstName: string | null;
  maskedPhone: string;
}

/** 254712345678 → 2547••••678: keep the prefix and last 3 digits. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

interface GroupRow {
  id: string;
  package_id: string;
  state: string;
  start_at: string | Date | null;
}
interface MembershipRow {
  id: string;
  group_id: string;
  user_id: string;
  wallet_id: string;
  join_order: number;
  turn_position: number | string | null;
  state: string;
}

export class GroupNotFoundError extends Error {
  constructor(id: string) {
    super(`group ${id} not found`);
    this.name = 'GroupNotFoundError';
  }
}
export class GroupNotJoinableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroupNotJoinableError';
  }
}
export class AlreadyJoinedError extends Error {
  constructor(groupId: string) {
    super(`already a member of group ${groupId}`);
    this.name = 'AlreadyJoinedError';
  }
}
/** The user is already in as many live groups at once as the pilot allows
 *  (product spec §8.5 — fraud/abuse limit on concurrent memberships). */
export class JoinLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`you can be in at most ${limit} active group${limit === 1 ? '' : 's'} at a time`);
    this.name = 'JoinLimitReachedError';
  }
}

/** Default cap on how many filling/active groups one account may be in at
 *  once. Overridable via env (GROUP_JOIN_LIMIT); 0 or less disables the cap. */
export const DEFAULT_MAX_ACTIVE_GROUPS = 3;

/**
 * Postgres persistence for groups, members and their wallets. The money
 * ledger itself lives in PgLedgerRepo; this store holds the group/membership
 * structure the engine operates over.
 */
export class GroupStore {
  constructor(
    private readonly pool: Pool,
    /** Max filling/active groups one user may be in at once; ≤ 0 disables. */
    private readonly maxActiveGroups: number = DEFAULT_MAX_ACTIVE_GROUPS,
  ) {}

  /** How many live groups (filling or active) the user is currently an active
   *  member of — completed/left/dissolved memberships don't count. */
  async countActiveMemberships(userId: string): Promise<number> {
    if (!isUuid(userId)) return 0;
    const res = await this.pool.query<{ c: number | string }>(
      `SELECT count(*) AS c
       FROM membership m JOIN "group" g ON g.id = m.group_id
       WHERE m.user_id = $1 AND m.state = 'active' AND g.state IN ('filling', 'active')`,
      [userId],
    );
    return Number(res.rows[0]?.c ?? 0);
  }

  /** Insert the fixed Daily package row if it is not there yet. */
  async ensureDailyPackage(pkg: Package): Promise<void> {
    const found = await this.pool.query('SELECT 1 FROM package WHERE id = $1', [DAILY_PACKAGE_DB_ID]);
    if (found.rowCount && found.rowCount > 0) return;
    await this.pool.query(
      `INSERT INTO package (id, name, size, hourly_contribution, fee_pct)
       VALUES ($1, $2, $3, $4, $5)`,
      [DAILY_PACKAGE_DB_ID, pkg.name, pkg.size, pkg.hourlyContribution.toString(), pkg.feePct.toString()],
    );
  }

  async createGroup(): Promise<Group> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "group" (id, package_id, state, start_at, created_at)
       VALUES ($1, $2, 'filling', NULL, $3)`,
      [id, DAILY_PACKAGE_DB_ID, new Date().toISOString()],
    );
    return { id, packageId: DAILY_PACKAGE_DB_ID, state: 'filling' };
  }

  /**
   * Add an existing (authenticated) user to a filling group, creating their
   * wallet and membership at the next turn position. The caller's identity —
   * not a throwaway user — owns the membership.
   */
  async createMembershipForUser(groupId: string, userId: string, pkg: Package): Promise<Membership> {
    const loaded = await this.getGroup(groupId);
    if (loaded.group.state !== 'filling') {
      throw new GroupNotJoinableError(`group ${groupId} is ${loaded.group.state}, not filling`);
    }
    if (loaded.memberships.length >= pkg.size) {
      throw new GroupNotJoinableError(`group ${groupId} is full`);
    }
    if (loaded.memberships.some((m) => m.userId === userId)) {
      throw new AlreadyJoinedError(groupId);
    }
    if (this.maxActiveGroups > 0 && (await this.countActiveMemberships(userId)) >= this.maxActiveGroups) {
      throw new JoinLimitReachedError(this.maxActiveGroups);
    }

    const walletId = randomUUID();
    const membershipId = randomUUID();
    const joinOrder = loaded.memberships.length + 1;
    const now = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO wallet (id, user_id, kind, currency, created_at) VALUES ($1, $2, 'member', 'KES', $3)`,
      [walletId, userId, now],
    );
    await this.pool.query(
      `INSERT INTO membership (id, group_id, user_id, wallet_id, join_order, state)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [membershipId, groupId, userId, walletId, joinOrder],
    );

    return { id: membershipId, groupId, userId, walletId, joinOrder, state: 'active' };
  }

  /** The earliest filling group with room that the user has not already
   *  joined, or null if there is none. */
  async findJoinableGroupForUser(pkg: Package, userId: string): Promise<string | null> {
    const filling = await this.pool.query<{ id: string }>(
      "SELECT id FROM \"group\" WHERE state = 'filling' ORDER BY created_at",
    );
    for (const row of filling.rows) {
      const count = await this.pool.query<{ c: number | string }>(
        'SELECT count(*) AS c FROM membership WHERE group_id = $1',
        [row.id],
      );
      if (Number(count.rows[0]?.c ?? 0) >= pkg.size) continue;
      const mine = await this.pool.query('SELECT 1 FROM membership WHERE group_id = $1 AND user_id = $2', [
        row.id,
        userId,
      ]);
      if (mine.rowCount && mine.rowCount > 0) continue;
      return row.id;
    }
    return null;
  }

  /** Join the user to a filling group for the package, allocating or creating
   *  one as needed (product spec §3.4 — many groups of a package in parallel). */
  async joinPackage(userId: string, pkg: Package): Promise<Membership> {
    let groupId = await this.findJoinableGroupForUser(pkg, userId);
    groupId ??= (await this.createGroup()).id;
    return this.createMembershipForUser(groupId, userId, pkg);
  }

  /** Test/seed helper: mint a fresh user and join them to a group. Not used
   *  by the API, which ties joins to the authenticated user. */
  async joinGroupAsNewUser(groupId: string, pkg: Package): Promise<Membership> {
    const userId = randomUUID();
    await this.pool.query(
      `INSERT INTO app_user (id, phone, kyc_level, status, created_at) VALUES ($1, $2, 'phone', 'active', $3)`,
      [userId, `test-user-${userId}`, new Date().toISOString()],
    );
    return this.createMembershipForUser(groupId, userId, pkg);
  }

  async walletOwner(walletId: string): Promise<string | null> {
    if (!isUuid(walletId)) return null;
    const res = await this.pool.query<{ user_id: string | null }>(
      'SELECT user_id FROM wallet WHERE id = $1',
      [walletId],
    );
    return res.rows[0]?.user_id ?? null;
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    if (!isUuid(groupId)) return false;
    const res = await this.pool.query('SELECT 1 FROM membership WHERE group_id = $1 AND user_id = $2', [
      groupId,
      userId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  async getGroup(groupId: string): Promise<LoadedGroup> {
    if (!isUuid(groupId)) throw new GroupNotFoundError(groupId);
    const g = await this.pool.query<GroupRow>('SELECT * FROM "group" WHERE id = $1', [groupId]);
    const row = g.rows[0];
    if (!row) throw new GroupNotFoundError(groupId);
    const members = await this.pool.query<MembershipRow>(
      'SELECT * FROM membership WHERE group_id = $1 ORDER BY join_order',
      [groupId],
    );
    return {
      group: { id: row.id, packageId: row.package_id, state: row.state as Group['state'] },
      memberships: members.rows.map(mapMembership),
      startAt: row.start_at ? new Date(row.start_at) : null,
    };
  }

  /** Members of a group with display info (name + masked phone) for the view. */
  async listMemberViews(groupId: string): Promise<MemberView[]> {
    if (!isUuid(groupId)) return [];
    const res = await this.pool.query<{
      user_id: string;
      join_order: number | string;
      turn_position: number | string | null;
      state: string;
      phone: string;
      display_name: string | null;
    }>(
      `SELECT m.user_id, m.join_order, m.turn_position, m.state, u.phone, u.display_name
       FROM membership m JOIN app_user u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY m.join_order`,
      [groupId],
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      joinOrder: Number(r.join_order),
      turnPosition: r.turn_position == null ? null : Number(r.turn_position),
      state: r.state,
      firstName: r.display_name,
      maskedPhone: maskPhone(r.phone),
    }));
  }

  /** The membership id that owns a wallet (for its locked-hold account). */
  async membershipIdByWallet(walletId: string): Promise<string | null> {
    if (!isUuid(walletId)) return null;
    const res = await this.pool.query<{ id: string }>('SELECT id FROM membership WHERE wallet_id = $1', [
      walletId,
    ]);
    return res.rows[0]?.id ?? null;
  }

  async listActive(): Promise<LoadedGroup[]> {
    const g = await this.pool.query<GroupRow>("SELECT id FROM \"group\" WHERE state = 'active'");
    return Promise.all(g.rows.map((r) => this.getGroup(r.id)));
  }

  /** Filling groups older than `maxAgeMs` — stalled, since they never filled
   *  and secured. (Age filtered in JS to stay driver-independent.) */
  async listStalledFilling(maxAgeMs: number, now: Date): Promise<LoadedGroup[]> {
    const g = await this.pool.query<{ id: string; created_at: string | Date }>(
      "SELECT id, created_at FROM \"group\" WHERE state = 'filling'",
    );
    const cutoff = now.getTime() - maxAgeMs;
    const stale = g.rows.filter((r) => new Date(r.created_at).getTime() <= cutoff);
    return Promise.all(stale.map((r) => this.getGroup(r.id)));
  }

  async setMembershipState(membershipId: string, state: Membership['state']): Promise<void> {
    await this.pool.query('UPDATE membership SET state = $1 WHERE id = $2', [state, membershipId]);
  }

  /** Assign a member's payout position and mark them secured. */
  async setTurnPosition(membershipId: string, position: number, securedAt: Date): Promise<void> {
    await this.pool.query('UPDATE membership SET turn_position = $1, secured_at = $2 WHERE id = $3', [
      position,
      securedAt.toISOString(),
      membershipId,
    ]);
  }

  async setState(groupId: string, state: Group['state'], startAt?: Date): Promise<void> {
    if (startAt) {
      await this.pool.query('UPDATE "group" SET state = $1, start_at = $2 WHERE id = $3', [
        state,
        startAt.toISOString(),
        groupId,
      ]);
    } else {
      await this.pool.query('UPDATE "group" SET state = $1 WHERE id = $2', [state, groupId]);
    }
  }
}

function mapMembership(r: MembershipRow): Membership {
  const base = {
    id: r.id,
    groupId: r.group_id,
    userId: r.user_id,
    walletId: r.wallet_id,
    joinOrder: Number(r.join_order),
    state: r.state as Membership['state'],
  };
  return r.turn_position == null ? base : { ...base, turnPosition: Number(r.turn_position) };
}
