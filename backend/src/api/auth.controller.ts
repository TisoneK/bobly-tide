import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import type { AuthService } from '../auth/auth.service';
import { toHttp } from './errors';
import { AUTH_SERVICE } from './tokens';
import { requirePhone } from './validation';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly auth: AuthService) {}

  /** Send a one-time code to the phone. Always 200 — never reveals whether
   *  the number exists, and never returns the code. */
  @Post('otp/request')
  @HttpCode(200)
  async request(@Body() body: { phone?: unknown }) {
    const phone = requirePhone(body?.phone);
    await this.auth.requestOtp(phone);
    return { requested: true };
  }

  /** Verify a code and issue a session token. */
  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body() body: { phone?: unknown; code?: unknown }) {
    const phone = requirePhone(body?.phone);
    const code = String(body?.code ?? '');
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('code must be 6 digits');
    try {
      return await this.auth.verifyOtp(phone, code);
    } catch (e) {
      throw toHttp(e);
    }
  }
}
