import { ConflictException, Controller, ForbiddenException, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import { fundHold } from '../domain/holds';
import type { Group, Membership, Package } from '../domain/types';
import { accountIdsForGroup, withLedger } from '../pg-settlement';
import type { PgLedgerRepo } from '../repo/pg';
import { settleDueHours } from '../scheduler';
import type { VerificationService } from '../verification/verification.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { GroupNotJoinableError, type GroupStore, type LoadedGroup } from './group.store';
import { toHttp } from './errors';
import {
  GROUP_STORE,
  LEDGER_REPO,
  PACKAGE,
  SCHEDULER_CONFIG,
  VERIFICATION_SERVICE,
  type SchedulerConfig,
} from './tokens';

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(
    @Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
    @Inject(VERIFICATION_SERVICE) private readonly verification: VerificationService,
  ) {}

  /** Operational: create an empty filling group. (Members normally reach a
   *  group through POST /packages/daily/join, which allocates one.) */
  @Post()
  async create() {
    const g = await this.store.createGroup();
    return { id: g.id, state: g.state, package: this.pkg.name, size: this.pkg.size };
  }

  /** Join a specific group, tied to the authenticated user. */
  @Post(':id/join')
  async join(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      await this.verification.requireVerified(user.sub);
      const m = await this.store.createMembershipForUser(id, user.sub, this.pkg);
      return { groupId: id, membershipId: m.id, walletId: m.walletId, joinOrder: m.joinOrder };
    } catch (e) {
      throw toHttp(e);
    }
  }

  /**
   * Post your security to claim a turn. The payout position is assigned
   * first-come-first-served (the order members secure), and the hold for
   * that position is locked from your wallet now. When the last member
   * secures, the group activates and the hourly turns begin. Member-only,
   * verified, one secure per member.
   */
  @Post(':id/secure')
  async secure(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      await this.verification.requireVerified(user.sub);
      const loaded = await this.store.getGroup(id);
      const me = this.requireMember(loaded, user);
      if (loaded.group.state !== 'filling') {
        throw new GroupNotJoinableError(`group ${id} is ${loaded.group.state}, can no longer be secured`);
      }
      if (me.turnPosition != null) throw new ConflictException('you have already secured your spot');

      const securedCount = loaded.memberships.filter((m) => m.turnPosition != null).length;
      const position = securedCount + 1;
      const meSecured: Membership = { ...me, turnPosition: position };

      // Lock the hold for this position atomically; 400 if the wallet is short.
      await withLedger(this.repo, accountIdsForGroup([meSecured]), (mem) =>
        fundHold(meSecured, this.pkg, mem),
      );
      await this.store.setTurnPosition(me.id, position, new Date());

      // All secured → the group starts and the clock begins.
      let state: Group['state'] = loaded.group.state;
      let startAt = loaded.startAt;
      if (position === this.pkg.size) {
        startAt = new Date();
        await this.store.setState(id, 'active', startAt);
        state = 'active';
      }
      return {
        turnPosition: position,
        securedCount: position,
        size: this.pkg.size,
        state,
        startAt: startAt?.toISOString() ?? null,
      };
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Settle any hours due now. Members of the group only. */
  @Post(':id/settle-due')
  async settleDue(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      const loaded = await this.store.getGroup(id);
      this.requireMember(loaded, user);
      return await settleDueHours(this.repo, this.store, loaded, this.pkg, new Date(), this.config.hourMs);
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Member view: turn order + states, your own position, balance, and when
   *  your turn arrives (for the countdown). Other members' balances are not
   *  exposed. */
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      const loaded = await this.store.getGroup(id);
      const me = this.requireMember(loaded, user);
      const securedCount = loaded.memberships.filter((m) => m.turnPosition != null).length;

      // When your turn hour begins: start + (position-1) hours. Null until the
      // group is active and you have secured a position.
      let yourTurnAt: string | null = null;
      if (loaded.group.state === 'active' && loaded.startAt && me.turnPosition != null) {
        yourTurnAt = new Date(
          loaded.startAt.getTime() + (me.turnPosition - 1) * this.config.hourMs,
        ).toISOString();
      }

      return {
        id: loaded.group.id,
        state: loaded.group.state,
        startAt: loaded.startAt?.toISOString() ?? null,
        size: this.pkg.size,
        joined: loaded.memberships.length,
        securedCount,
        hourMs: this.config.hourMs,
        yourPosition: me.turnPosition ?? null,
        yourSecured: me.turnPosition != null,
        yourTurnAt,
        yourBalance: (await this.repo.balanceOf(me.walletId)).toString(),
        members: loaded.memberships.map((m) => ({
          joinOrder: m.joinOrder,
          turnPosition: m.turnPosition ?? null,
          state: m.state,
          isYou: m.userId === user.sub,
        })),
      };
    } catch (e) {
      throw toHttp(e);
    }
  }

  private requireMember(loaded: LoadedGroup, user: SessionClaims): Membership {
    const me = loaded.memberships.find((m) => m.userId === user.sub);
    if (!me) throw new ForbiddenException('you are not a member of this group');
    return me;
  }
}
