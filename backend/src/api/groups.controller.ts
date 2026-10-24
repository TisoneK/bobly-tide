import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { fundGroupHolds } from '../domain/holds';
import { PLATFORM_WALLET, type Package } from '../domain/types';
import { accountIdsForGroup, withLedger } from '../pg-settlement';
import type { PgLedgerRepo } from '../repo/pg';
import { settleDueHours } from '../scheduler';
import { GroupNotJoinableError, type GroupStore } from './group.store';
import { toHttp } from './errors';
import { GROUP_STORE, LEDGER_REPO, PACKAGE, SCHEDULER_CONFIG, type SchedulerConfig } from './tokens';

@Controller('groups')
export class GroupsController {
  constructor(
    @Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
  ) {}

  @Post()
  async create() {
    await this.store.ensureDailyPackage(this.pkg);
    const g = await this.store.createGroup();
    return { id: g.id, state: g.state, package: this.pkg.name, size: this.pkg.size };
  }

  @Post(':id/join')
  async join(@Param('id') id: string, @Body() body: { phone?: string }) {
    try {
      const m = await this.store.joinGroup(id, this.pkg, body?.phone);
      return { membershipId: m.id, walletId: m.walletId, joinOrder: m.joinOrder };
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Lock each member's security hold and activate the group. */
  @Post(':id/start')
  async start(@Param('id') id: string) {
    try {
      const loaded = await this.store.getGroup(id);
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

  /** Settle any hours that have come due now (also driven by the scheduler). */
  @Post(':id/settle-due')
  async settleDue(@Param('id') id: string) {
    try {
      const loaded = await this.store.getGroup(id);
      return await settleDueHours(this.repo, this.store, loaded, this.pkg, new Date(), this.config.hourMs);
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const loaded = await this.store.getGroup(id);
      const members = await Promise.all(
        loaded.memberships.map(async (m) => ({
          membershipId: m.id,
          walletId: m.walletId,
          joinOrder: m.joinOrder,
          state: m.state,
          balance: (await this.repo.balanceOf(m.walletId)).toString(),
        })),
      );
      return {
        id: loaded.group.id,
        state: loaded.group.state,
        startAt: loaded.startAt?.toISOString() ?? null,
        size: this.pkg.size,
        platform: (await this.repo.balanceOf(PLATFORM_WALLET)).toString(),
        members,
      };
    } catch (e) {
      throw toHttp(e);
    }
  }
}
