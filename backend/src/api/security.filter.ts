import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import { classifyRejection } from '../security/security-events';
import type { SecurityService } from '../security/security.service';
import { SECURITY_SERVICE } from './tokens';

interface RequestLike {
  ip?: string;
  method?: string;
  url?: string;
  user?: { sub?: string; phone?: string };
  socket?: { remoteAddress?: string };
}

/**
 * Global filter that turns security-relevant HTTP rejections into audit
 * events (ADR-24) — one wiring point for auth/authz/callback/lockout/
 * join-limit rejections across every route. It records (via SecurityService,
 * which never throws) then sends Nest's standard error response unchanged, so
 * behaviour and error bodies are identical to before.
 */
@Catch(HttpException)
export class SecurityEventFilter implements ExceptionFilter {
  constructor(@Inject(SECURITY_SERVICE) private readonly security: SecurityService) {}

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<RequestLike>();
    const res = ctx.getResponse<{ status: (c: number) => { json: (b: unknown) => void } }>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    const rawMessage = typeof body === 'string' ? body : (body as { message?: unknown })?.message;
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage ?? exception.message);

    const classified = classifyRejection(status, message);
    if (classified) {
      await this.security.record({
        type: classified.type,
        severity: classified.severity,
        userId: req?.user?.sub ?? null,
        phone: req?.user?.phone ?? null,
        ip: req?.ip ?? req?.socket?.remoteAddress ?? null,
        detail: `${req?.method ?? ''} ${req?.url ?? ''} — ${message}`.trim(),
      });
    }

    res
      .status(status)
      .json(typeof body === 'string' ? { statusCode: status, message: body, error: exception.name } : body);
  }
}
