import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Rate limits per visitor. Behind nginx, `trust proxy` makes req.ip the real visitor address.
 * A request that still shows a loopback address came straight from the storefront server with no
 * visitor attached (page renders); counting those would put every visitor in one shared bucket,
 * so they are not limited. Visitor-triggered calls (login, orders, reviews) forward the visitor's
 * address and are limited as normal. nginx always adds the real address, so outside traffic
 * can never look like loopback.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { ip } = context.switchToHttp().getRequest<{ ip?: string }>();
    return Promise.resolve(!!ip && LOOPBACK.has(ip));
  }
}
