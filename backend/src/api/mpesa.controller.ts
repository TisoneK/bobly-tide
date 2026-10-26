import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import { type CallbackSourceConfig, verifyCallbackSource } from '../mpesa/callback-guard';
import type { MpesaService } from '../mpesa/mpesa.service';
import type { VerificationService } from '../verification/verification.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { requireWalletOwner } from './ownership';
import { GROUP_STORE, MPESA_CALLBACK_CONFIG, MPESA_SERVICE, VERIFICATION_SERVICE } from './tokens';
import { requirePhone, wholeAmount } from './validation';

/** Minimal shape of the underlying request we need for source validation. */
interface RequestLike {
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Controller()
export class MpesaController {
  constructor(
    @Inject(MPESA_SERVICE) private readonly mpesa: MpesaService,
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(VERIFICATION_SERVICE) private readonly verification: VerificationService,
    @Inject(MPESA_CALLBACK_CONFIG) private readonly callbackCfg: CallbackSourceConfig,
  ) {}

  /** Reject a callback that isn't demonstrably from Daraja (ADR-22): wrong or
   *  missing URL secret, or a source IP outside the allowlist. Both checks are
   *  off when unconfigured, so dev / the fake client are unaffected. */
  private assertCallbackSource(token: string | undefined, req: RequestLike): void {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const check = verifyCallbackSource(this.callbackCfg, { token, ip });
    if (!check.ok) throw new ForbiddenException(check.reason);
  }

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
      await this.verification.requireVerified(user.sub);
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
      await this.verification.requireVerified(user.sub);
      await requireWalletOwner(this.store, accountId, user);
      return await this.mpesa.initiateWithdrawal(accountId, amount, phone);
    } catch (e) {
      throw toHttp(e);
    }
  }

  // The optional `:token` path segment carries the URL secret we registered
  // with Daraja; the tokenless path stays valid for dev (secret unconfigured).
  @Post(['mpesa/callbacks/stk', 'mpesa/callbacks/stk/:token'])
  @HttpCode(200)
  async stkCallback(@Body() body: unknown, @Param('token') token: string | undefined, @Req() req: RequestLike) {
    this.assertCallbackSource(token, req);
    await this.mpesa.handleStkCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Post(['mpesa/callbacks/b2c', 'mpesa/callbacks/b2c/:token'])
  @HttpCode(200)
  async b2cCallback(@Body() body: unknown, @Param('token') token: string | undefined, @Req() req: RequestLike) {
    this.assertCallbackSource(token, req);
    await this.mpesa.handleB2cCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
