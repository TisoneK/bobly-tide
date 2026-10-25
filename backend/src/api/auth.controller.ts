import { BadRequestException, Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { AuthService } from '../auth/auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import { AUTH_SERVICE } from './tokens';
import { requirePhone } from './validation';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly auth: AuthService) {}

  /** Set your display (first) name — shown in the turn order. */
  @Post('profile')
  @UseGuards(AuthGuard)
  async setProfile(@Body() body: { displayName?: unknown }, @CurrentUser() user: SessionClaims) {
    const name = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (name.length < 1 || name.length > 40) {
      throw new BadRequestException('displayName must be 1–40 characters');
    }
    await this.auth.setProfile(user.sub, name);
    return { displayName: name };
  }

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
