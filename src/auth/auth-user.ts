import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../users/user.entity.js';

/** What request.user holds on routes protected by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
