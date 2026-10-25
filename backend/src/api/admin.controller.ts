import { BadRequestException, Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { VerificationService } from '../verification/verification.service';
import type { VerificationKind, VerificationStore } from '../verification/verification.store';
import { AdminGuard } from './admin.guard';
import { AuthGuard } from './auth.guard';
import { toHttp } from './errors';
import { VERIFICATION_SERVICE, VERIFICATION_STORE } from './tokens';

const KINDS = ['email', 'id', 'face', 'address'];

/** Ops console — admins only (AdminGuard). KYC review for the pilot. */
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(VERIFICATION_STORE) private readonly store: VerificationStore,
    @Inject(VERIFICATION_SERVICE) private readonly svc: VerificationService,
  ) {}

  /** Submissions awaiting a decision. */
  @Get('verifications')
  pending() {
    return this.store.listPending();
  }

  /** Approve or reject a member's submission. */
  @Post('verifications/:userId/review')
  async review(
    @Param('userId') userId: string,
    @Body() body: { kind?: unknown; decision?: unknown; reason?: unknown },
  ) {
    const kind = body?.kind;
    if (typeof kind !== 'string' || !KINDS.includes(kind)) {
      throw new BadRequestException(`kind must be one of ${KINDS.join(', ')}`);
    }
    const decision = body?.decision;
    if (decision !== 'verified' && decision !== 'rejected') {
      throw new BadRequestException('decision must be "verified" or "rejected"');
    }
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;
    try {
      await this.svc.review(userId, kind as VerificationKind, decision, reason);
      return { userId, kind, status: decision };
    } catch (e) {
      throw toHttp(e);
    }
  }
}
