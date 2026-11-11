import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../users/user.entity.js';
import type { AuthUser } from './auth-user.js';

const ROLES_KEY = 'roles';

/** Use together with JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.Admin) */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return !!user && required.includes(user.role);
  }
}
