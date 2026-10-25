import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';
import { ADMIN_CONFIG } from './tokens';

/** Ops/admin identities, by phone. Configured from env (ADMIN_PHONES);
 *  no role column, so admin status is not forgeable in a token. */
export interface AdminConfig {
  phones: Set<string>;
}

/** Requires the authenticated caller to be an admin. Runs after AuthGuard
 *  (which sets request.user), so apply as @UseGuards(AuthGuard, AdminGuard). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(ADMIN_CONFIG) private readonly config: AdminConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: SessionClaims }>();
    const phone = req.user?.phone;
    if (!phone || !this.config.phones.has(phone)) {
      throw new ForbiddenException('admin access only');
    }
    return true;
  }
}
