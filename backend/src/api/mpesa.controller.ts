import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { MpesaService } from '../mpesa/mpesa.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { requireWalletOwner } from './ownership';
import { GROUP_STORE, MPESA_SERVICE } from './tokens';
import { requirePhone, wholeAmount } from './validation';

@Controller()
export class MpesaController {
  constructor(
    @Inject(MPESA_SERVICE) private readonly mpesa: MpesaService,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
  ) {}

  /** Start a top-up: prompts the member's phone via STK push. The wallet is
   *  credited later, only when the STK callback confirms success. */
  @Post('wallets/:accountId/topup')
  @UseGuards(AuthGuard)
  async topup(
    @Param('accountId') accountId: string,
    @Body() body: { amount?: unknown; phone?: unknown },
    @CurrentUser() user: SessionClaims,
  ) {
    const amount = wholeAmount(body?.amount);
    const phone = requirePhone(body?.phone);
    try {
      await requireWalletOwner(this.store, accountId, user);
      return await this.mpesa.initiateTopup(accountId, amount, phone);
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Start a withdrawal: reserves the funds and sends a B2C payment. */
  @Post('wallets/:accountId/withdraw')
  @UseGuards(AuthGuard)
  async withdraw(
    @Param('accountId') accountId: string,
    @Body() body: { amount?: unknown; phone?: unknown },
    @CurrentUser() user: SessionClaims,
  ) {
    const amount = wholeAmount(body?.amount);
    const phone = requirePhone(body?.phone);
    try {
      await requireWalletOwner(this.store, accountId, user);
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
