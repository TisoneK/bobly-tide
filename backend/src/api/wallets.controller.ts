import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import { holdAccountId } from '../domain/holds';
import { Money } from '../domain/money';
import type { MpesaConfig } from '../mpesa/mpesa.service';
import type { PgLedgerRepo } from '../repo/pg';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { requireWalletOwner } from './ownership';
import { GROUP_STORE, LEDGER_REPO, MPESA_CONFIG } from './tokens';

@Controller('wallets')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(
    @Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(MPESA_CONFIG) private readonly mpesa: MpesaConfig,
  ) {}

  // Top-up and withdrawal live in MpesaController — real money moves only
  // through M-Pesa (build spec §7). This controller is read-only.

  @Get(':accountId')
  async get(@Param('accountId') accountId: string, @CurrentUser() user: SessionClaims) {
    try {
      await requireWalletOwner(this.store, accountId, user);

      // Balance is split for the member: Available (spendable, withdrawable)
      // vs Held (their locked security, returned as the cycle runs). ADR-14.
      const available = await this.repo.balanceOf(accountId);
      const membershipId = await this.store.membershipIdByWallet(accountId);
      const held = membershipId
        ? await this.repo.balanceOf(holdAccountId(membershipId))
        : Money.zero();

      const entries = await this.repo.entriesForAccount(accountId);
      return {
        accountId,
        available: available.toString(),
        held: held.toString(),
        total: available.plus(held).toString(),
        withdrawalMin: this.mpesa.withdrawalMin.toString(),
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
