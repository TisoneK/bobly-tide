import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { KycKind } from '../verification/providers';
import type { VerificationService } from '../verification/verification.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import { VERIFICATION_SERVICE } from './tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KYC_KINDS: KycKind[] = ['id', 'face', 'address'];

@Controller('verification')
@UseGuards(AuthGuard)
export class VerificationController {
  constructor(@Inject(VERIFICATION_SERVICE) private readonly svc: VerificationService) {}

  @Get()
  async status(@CurrentUser() user: SessionClaims) {
    return this.svc.status(user.sub);
  }

  @Post('email/request')
  @HttpCode(200)
  async requestEmail(@Body() body: { email?: unknown }, @CurrentUser() user: SessionClaims) {
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!EMAIL_RE.test(email)) throw new BadRequestException('a valid email is required');
    await this.svc.startEmail(user.sub, email);
    return { requested: true };
  }

  @Post('email/verify')
  @HttpCode(200)
  async verifyEmail(@Body() body: { code?: unknown }, @CurrentUser() user: SessionClaims) {
    const code = String(body?.code ?? '');
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('code must be 6 digits');
    try {
      await this.svc.confirmEmail(user.sub, code);
      return { kind: 'email', status: 'verified' };
    } catch (e) {
      throw toHttp(e);
    }
  }

  /** Submit an id document, selfie, or proof of address for review. The
   *  `reference` is a handle to the uploaded asset (uploads are handled
   *  out of band for the pilot). */
  @Post('submit')
  async submit(
    @Body() body: { kind?: unknown; reference?: unknown },
    @CurrentUser() user: SessionClaims,
  ) {
    const kind = body?.kind;
    if (typeof kind !== 'string' || !KYC_KINDS.includes(kind as KycKind)) {
      throw new BadRequestException(`kind must be one of ${KYC_KINDS.join(', ')}`);
    }
    const reference = typeof body?.reference === 'string' && body.reference.trim() ? body.reference.trim() : null;
    if (!reference) throw new BadRequestException('a reference to the submitted document is required');
    const status = await this.svc.submit(user.sub, kind as KycKind, reference);
    return { kind, status };
  }

  /** Authorize a live-camera upload + liveness run straight to the KYC vendor.
   *  Returns the signed job the client SDK needs; the vendor resolves it later
   *  via its result callback. 400 if no async vendor is configured. */
  @Post('kyc/authorize')
  async authorize(@Body() body: { kind?: unknown }, @CurrentUser() user: SessionClaims) {
    const kind = body?.kind;
    if (typeof kind !== 'string' || !KYC_KINDS.includes(kind as KycKind)) {
      throw new BadRequestException(`kind must be one of ${KYC_KINDS.join(', ')}`);
    }
    try {
      return await this.svc.authorizeKyc(user.sub, kind as KycKind);
    } catch (e) {
      throw toHttp(e);
    }
  }
}
