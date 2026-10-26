import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  type FixedWindowLimiter,
  type RateRule,
  DEFAULT_RATE_RULES,
  matchRule,
} from '../security/rate-limit';
import { RATE_LIMIT_CONFIG, RATE_LIMITER } from './tokens';

export interface RateLimitConfig {
  enabled: boolean;
  rules?: RateRule[];
}

interface RequestLike {
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  body?: { phone?: unknown };
  socket?: { remoteAddress?: string };
}

/**
 * Global guard that throttles the sensitive routes in DEFAULT_RATE_RULES
 * (ADR-25). Runs before the auth guard, so an unauthenticated flood is
 * stopped early. Over the limit → 429 "rate limit exceeded", which the
 * security filter (ADR-24) records as a `rate_limited` event. Unlisted routes
 * and the disabled config pass straight through.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: FixedWindowLimiter,
    @Inject(RATE_LIMIT_CONFIG) private readonly config: RateLimitConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.enabled) return true;
    const req = context.switchToHttp().getRequest<RequestLike>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = (req.path ?? req.url ?? '').split('?')[0]!;

    const rule = matchRule(this.config.rules ?? DEFAULT_RATE_RULES, method, path);
    if (!rule) return true;

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : null;
    const subject = rule.by === 'phone' ? (phone ?? ip) : ip;
    const key = `${rule.name}:${subject}`;

    const result = this.limiter.check(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      // Message carries "rate limit" so the security filter classifies it as
      // rate_limited (not otp_locked).
      throw new HttpException(
        `rate limit exceeded; retry in ${Math.ceil(result.resetInMs / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
