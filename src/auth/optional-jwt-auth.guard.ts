import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from './auth-user.js';

/** Like JwtAuthGuard, but a missing or invalid token just means "guest" instead of a 401. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = AuthUser>(_err: unknown, user: T | false): T | null {
    return user || null;
  }
}
