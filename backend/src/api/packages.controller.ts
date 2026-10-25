import { Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { Package } from '../domain/types';
import type { VerificationService } from '../verification/verification.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { GROUP_STORE, PACKAGE, VERIFICATION_SERVICE } from './tokens';

@Controller('packages')
@UseGuards(AuthGuard)
export class PackagesController {
  constructor(
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
    @Inject(VERIFICATION_SERVICE) private readonly verification: VerificationService,
  ) {}

  /** Join the Daily package: the server allocates (or creates) a filling
   *  group and ties the membership to the authenticated user. Requires a
   *  fully verified member (build spec §6). */
  @Post('daily/join')
  async join(@CurrentUser() user: SessionClaims) {
    try {
      await this.verification.requireVerified(user.sub);
      const m = await this.store.joinPackage(user.sub, this.pkg);
      return { groupId: m.groupId, membershipId: m.id, walletId: m.walletId, joinOrder: m.joinOrder };
    } catch (e) {
      throw toHttp(e);
    }
  }
}
