import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { PgLedgerRepo } from '../repo/pg';
import { AuthGuard } from './auth.guard';
import { LEDGER_REPO } from './tokens';

@Controller('wallets')
@UseGuards(AuthGuard)
export class WalletsController {
  constructor(@Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo) {}

  // Top-up and withdrawal live in MpesaController — real money moves only
  // through M-Pesa (build spec §7). This controller is read-only.

  @Get(':accountId')
  async get(@Param('accountId') accountId: string) {
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
  }
}
