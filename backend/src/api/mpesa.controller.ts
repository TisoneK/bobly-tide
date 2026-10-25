import { BadRequestException, Body, Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { Money } from '../domain/money';
import type { MpesaService } from '../mpesa/mpesa.service';
import { toHttp } from './errors';
import { MPESA_SERVICE } from './tokens';

/** Whole-shilling amount, as M-Pesa requires (product spec §7). */
function wholeAmount(raw: unknown): Money {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('amount must be a positive whole number of shillings');
  }
  return Money.of(String(n));
}

function requirePhone(raw: unknown): string {
  if (typeof raw !== 'string' || !/^2547\d{8}$/.test(raw)) {
    throw new BadRequestException('phone must be an M-Pesa MSISDN like 2547XXXXXXXX');
  }
  return raw;
}

@Controller()
export class MpesaController {
  constructor(@Inject(MPESA_SERVICE) private readonly mpesa: MpesaService) {}

  /** Start a top-up: prompts the member's phone via STK push. The wallet is
   *  credited later, only when the STK callback confirms success. */
  @Post('wallets/:accountId/topup')
  async topup(@Param('accountId') accountId: string, @Body() body: { amount?: unknown; phone?: unknown }) {
    const amount = wholeAmount(body?.amount);
    const phone = requirePhone(body?.phone);
    try {
      return await this.mpesa.initiateTopup(accountId, amount, phone);
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Start a withdrawal: reserves the funds and sends a B2C payment. */
  @Post('wallets/:accountId/withdraw')
  async withdraw(@Param('accountId') accountId: string, @Body() body: { amount?: unknown; phone?: unknown }) {
    const amount = wholeAmount(body?.amount);
    const phone = requirePhone(body?.phone);
    try {
      return await this.mpesa.initiateWithdrawal(accountId, amount, phone);
    } catch (e) {
      throw toHttp(e);
    }
  }

  @Post('mpesa/callbacks/stk')
  @HttpCode(200)
  async stkCallback(@Body() body: unknown) {
    await this.mpesa.handleStkCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Post('mpesa/callbacks/b2c')
  @HttpCode(200)
  async b2cCallback(@Body() body: unknown) {
    await this.mpesa.handleB2cCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
