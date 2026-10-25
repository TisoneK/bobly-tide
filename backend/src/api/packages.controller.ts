import { Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import type { Package } from '../domain/types';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toHttp } from './errors';
import type { GroupStore } from './group.store';
import { GROUP_STORE, PACKAGE } from './tokens';

@Controller('packages')
@UseGuards(AuthGuard)
export class PackagesController {
  constructor(
    @Inject(GROUP_STORE) private readonly store: GroupStore,
    @Inject(PACKAGE) private readonly pkg: Package,
  ) {}

  /** Join the Daily package: the server allocates (or creates) a filling
   *  group and ties the membership to the authenticated user. */
  @Post('daily/join')
  async join(@CurrentUser() user: SessionClaims) {
    try {
      const m = await this.store.joinPackage(user.sub, this.pkg);
      return { groupId: m.groupId, membershipId: m.id, walletId: m.walletId, joinOrder: m.joinOrder };
    } catch (e) {
      throw toHttp(e);
    }
  }
}
