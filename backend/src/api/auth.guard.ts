import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthConfig, SessionClaims } from '../auth/auth.service';
import { verifyJwt } from '../auth/jwt';
import { AUTH_CONFIG } from './tokens';

/** Requires a valid Bearer session token; attaches the claims to request.user. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown>; user?: SessionClaims }>();
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      req.user = verifyJwt<SessionClaims>(header.slice(7), this.config.jwtSecret);
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
  }
}
