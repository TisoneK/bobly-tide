import { Controller, ForbiddenException, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import { fundGroupHolds } from '../domain/holds';
import type { Membership, Package } from '../domain/types';
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

  /** Fund every member's hold and activate the group. Members of the group only. */
  @Post(':id/start')
  async start(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      const loaded = await this.store.getGroup(id);
      this.requireMember(loaded, user);
      if (loaded.group.state !== 'filling') {
        throw new GroupNotJoinableError(`group ${id} is ${loaded.group.state}, cannot start`);
      }
      if (loaded.memberships.length !== this.pkg.size) {
        throw new GroupNotJoinableError(
          `group ${id} is not full (${loaded.memberships.length}/${this.pkg.size})`,
        );
      }
      await withLedger(this.repo, accountIdsForGroup(loaded.memberships), (mem) =>
        fundGroupHolds(this.pkg, loaded.memberships, mem),
      );
      const startAt = new Date();
      await this.store.setState(id, 'active', startAt);
      return { state: 'active', startAt: startAt.toISOString() };
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

  /** Member view: turn order + states, your own position and balance. Other
   *  members' balances are not exposed. */
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionClaims) {
    try {
      const loaded = await this.store.getGroup(id);
      const me = this.requireMember(loaded, user);
      return {
        id: loaded.group.id,
        state: loaded.group.state,
        startAt: loaded.startAt?.toISOString() ?? null,
        size: this.pkg.size,
        yourPosition: me.joinOrder,
        yourBalance: (await this.repo.balanceOf(me.walletId)).toString(),
        members: loaded.memberships.map((m) => ({
          joinOrder: m.joinOrder,
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
