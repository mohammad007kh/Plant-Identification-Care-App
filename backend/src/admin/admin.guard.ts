import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../modules/users/users.repository';

type AuthedRequest = Request & { user?: PublicUser };

/**
 * Role-based guard for every admin-only route (Station 08 / Station 17, US9).
 * MUST run AFTER `JwtAuthGuard` (which populates `req.user`) — always apply as
 * `@UseGuards(JwtAuthGuard, AdminGuard)`, never alone. A non-admin
 * authenticated user gets 403 (not 401): they ARE authenticated, they simply
 * lack the required `role=admin`. This is the single most security-sensitive
 * surface in the app — every admin controller in this module carries it.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin.roleRequired');
    }
    return true;
  }
}
