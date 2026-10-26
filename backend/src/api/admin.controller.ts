import { BadRequestException, Controller, Get, Inject, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import type { Package } from '../domain/types';
import type { VerificationService } from '../verification/verification.service';
import type { VerificationKind, VerificationStore } from '../verification/verification.store';
import { AdminGuard } from './admin.guard';
import { AuthGuard } from './auth.guard';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { GROUP_STORE, PACKAGE, VERIFICATION_SERVICE, VERIFICATION_STORE } from './tokens';

const KINDS = ['email', 'id', 'face', 'address'];

/** Ops console — admins only (AdminGuard): KYC review + group/member
 *  oversight for the pilot (ADR-15, ADR-23). */
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(VERIFICATION_STORE) private readonly store: VerificationStore,
    @Inject(VERIFICATION_SERVICE) private readonly svc: VerificationService,
    @Inject(GROUP_STORE) private readonly groups: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
  ) {}

  /** Submissions awaiting a decision. */
  @Get('verifications')
  pending() {
    return this.store.listPending();
  }

  /** Group summaries for oversight, newest first (default 50, max 200). */
  @Get('groups')
  async listGroups(@Query('limit') limit?: string) {
    const n = Number(limit);
    const capped = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : 50;
    const rows = await this.groups.adminListGroups(capped);
    return rows.map((r) => ({ ...r, size: this.pkg.size }));
  }

  /** One group's members + states for oversight (unmasked phone — admin only). */
  @Get('groups/:id')
  async groupDetail(@Param('id') id: string) {
    try {
      const loaded = await this.groups.getGroup(id);
      const members = await this.groups.adminMemberViews(id);
      return {
        id: loaded.group.id,
        state: loaded.group.state,
        size: this.pkg.size,
        startAt: loaded.startAt?.toISOString() ?? null,
        joined: loaded.memberships.length,
        secured: loaded.memberships.filter((m) => m.turnPosition != null).length,
        members: members.map((m) => ({
          joinOrder: m.joinOrder,
          turnPosition: m.turnPosition,
          state: m.state,
          name: m.name,
          phone: m.phone,
          secured: m.turnPosition != null,
        })),
      };
    } catch (e) {
      throw toHttp(e);
    }
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
