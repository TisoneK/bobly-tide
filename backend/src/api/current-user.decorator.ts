import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionClaims } from '../auth/auth.service';

/** The authenticated session claims, set on the request by AuthGuard. Works
 *  without decorator metadata (the decorator stores its own param metadata). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionClaims => {
  return ctx.switchToHttp().getRequest<{ user: SessionClaims }>().user;
});
