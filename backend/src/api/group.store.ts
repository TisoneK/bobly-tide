import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Group, Membership, Package } from '../domain/types';

// One fixed package row for the pilot's single Daily package. The engine
// uses the DAILY_PACKAGE constant for its maths; this id only ties group
// rows to a package row in the schema.
export const DAILY_PACKAGE_DB_ID = '00000000-0000-0000-0000-0000000000da';

export interface LoadedGroup {
  group: Group;
  memberships: Membership[];
  startAt: Date | null;
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

/**
 * Postgres persistence for groups, members and their wallets. The money
 * ledger itself lives in PgLedgerRepo; this store holds the group/membership
 * structure the engine operates over.
 */
export class GroupStore {
  constructor(private readonly pool: Pool) {}

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

  /** Add a member to a filling group: creates the user, their wallet and the
   *  membership at the next turn position. */
  async joinGroup(groupId: string, pkg: Package, phone?: string): Promise<Membership> {
    const loaded = await this.getGroup(groupId);
    if (loaded.group.state !== 'filling') {
      throw new GroupNotJoinableError(`group ${groupId} is ${loaded.group.state}, not filling`);
    }
    if (loaded.memberships.length >= pkg.size) {
      throw new GroupNotJoinableError(`group ${groupId} is full`);
    }

    const userId = randomUUID();
    const walletId = randomUUID();
    const membershipId = randomUUID();
    const joinOrder = loaded.memberships.length + 1;
    const now = new Date().toISOString();
    const userPhone = phone ?? `+2547${randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0')}`;

    await this.pool.query(
      `INSERT INTO app_user (id, phone, kyc_level, status, created_at)
       VALUES ($1, $2, 'phone', 'active', $3)`,
      [userId, userPhone, now],
    );
    await this.pool.query(
      `INSERT INTO wallet (id, user_id, kind, currency, created_at)
       VALUES ($1, $2, 'member', 'KES', $3)`,
      [walletId, userId, now],
    );
    await this.pool.query(
      `INSERT INTO membership (id, group_id, user_id, wallet_id, join_order, state)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [membershipId, groupId, userId, walletId, joinOrder],
    );

    return { id: membershipId, groupId, userId, walletId, joinOrder, state: 'active' };
  }

  async getGroup(groupId: string): Promise<LoadedGroup> {
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

  async listActive(): Promise<LoadedGroup[]> {
    const g = await this.pool.query<GroupRow>("SELECT id FROM \"group\" WHERE state = 'active'");
    return Promise.all(g.rows.map((r) => this.getGroup(r.id)));
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
  return {
    id: r.id,
    groupId: r.group_id,
    userId: r.user_id,
    walletId: r.wallet_id,
    joinOrder: Number(r.join_order),
    state: r.state as Membership['state'],
  };
}
