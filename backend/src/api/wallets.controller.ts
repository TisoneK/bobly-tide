import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { PgLedgerRepo } from '../repo/pg';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { requireWalletOwner } from './ownership';
import { GROUP_STORE, LEDGER_REPO } from './tokens';

@Controller('wallets')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(
    @Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
  ) {}

  // Top-up and withdrawal live in MpesaController — real money moves only
  // through M-Pesa (build spec §7). This controller is read-only.

  @Get(':accountId')
  async get(@Param('accountId') accountId: string, @CurrentUser() user: SessionClaims) {
    try {
      await requireWalletOwner(this.store, accountId, user);
      const entries = await this.repo.entriesForAccount(accountId);
      return {
        accountId,
        balance: (await this.repo.balanceOf(accountId)).toString(),
        entries: entries.map((e) => ({
          type: e.type,
          amount: e.amount.toString(),
          groupId: e.groupId ?? null,
          hourIndex: e.hourIndex ?? null,
          at: e.createdAt.toISOString(),
        })),
      };
    } catch (e) {
      throw toHttp(e);
    }
  }
}
