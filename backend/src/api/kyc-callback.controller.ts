import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import type { VerificationService } from '../verification/verification.service';
import { VERIFICATION_SERVICE } from './tokens';

/**
 * Public KYC vendor result callback. Kept in its own controller (no
 * AuthGuard) — the vendor, not a logged-in member, calls it. Authenticity is
 * established inside the provider, which verifies the payload signature before
 * anything resolves; an unsigned or unmatched callback moves no state. Always
 * answers 200 so the vendor does not retry a payload we have already seen or
 * cannot match (resolution is idempotent).
 */
@Controller('verification/callbacks')
export class KycCallbackController {
  constructor(@Inject(VERIFICATION_SERVICE) private readonly svc: VerificationService) {}

  @Post('kyc')
  @HttpCode(200)
  async kyc(@Body() body: unknown) {
    const res = await this.svc.resolveKycCallback(body);
    return { received: true, matched: res.matched };
  }
}
