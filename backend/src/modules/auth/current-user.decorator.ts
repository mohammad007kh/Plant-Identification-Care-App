import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '../users/users.repository';

/** Injects the authenticated user (set by JwtAuthGuard). Use only on guarded routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser =>
    ctx.switchToHttp().getRequest<{ user: PublicUser }>().user,
);

/** Injects the authenticated user's internal id (set by JwtAuthGuard). */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<{ user: PublicUser }>().user.id,
);
