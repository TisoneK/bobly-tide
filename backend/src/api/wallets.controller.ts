import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Money } from '../domain/money';
import { withLedger } from '../pg-settlement';
import type { PgLedgerRepo } from '../repo/pg';
import { LEDGER_REPO } from './tokens';

@Controller('wallets')
export class WalletsController {
  constructor(@Inject(LEDGER_REPO) private readonly repo: PgLedgerRepo) {}

  /**
   * Internal/dev top-up — credits an account directly, standing in for an
   * M-Pesa deposit until Daraja is wired (build spec §7). Not a real payment.
   */
  @Post(':accountId/topup')
  async topup(@Param('accountId') accountId: string, @Body() body: { amount?: string | number }) {
    const raw = body?.amount;
    if (raw == null) throw new BadRequestException('amount is required');
    let amount: Money;
    try {
      amount = Money.of(raw);
    } catch {
      throw new BadRequestException('invalid amount');
    }
    if (amount.isNegative() || amount.isZero()) {
      throw new BadRequestException('amount must be positive');
    }

    await withLedger(this.repo, [accountId], (mem) =>
      mem.appendEntries([
        {
          id: randomUUID(),
          walletId: accountId,
          type: 'topup',
          amount,
          idempotencyKey: `topup:${accountId}:${randomUUID()}`,
          createdAt: new Date(),
        },
      ]),
    );
    return { accountId, balance: (await this.repo.balanceOf(accountId)).toString() };
  }

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
