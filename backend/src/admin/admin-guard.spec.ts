import { describe, expect, it } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { PublicUser } from '../modules/users/users.repository';
import { AdminGuard } from './admin.guard';

function ctxWithUser(user: PublicUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

const adminUser: PublicUser = {
  id: 'u-admin',
  publicId: 'pub-admin',
  email: 'a@x.local',
  role: 'admin',
};
const memberUser: PublicUser = {
  id: 'u-member',
  publicId: 'pub-member',
  email: 'b@x.local',
  role: 'user',
};

describe('AdminGuard (T-140, Station 08 RBAC — non-admin blocked)', () => {
  const guard = new AdminGuard();

  it('allows an authenticated admin through', () => {
    expect(guard.canActivate(ctxWithUser(adminUser))).toBe(true);
  });

  it('blocks a non-admin authenticated user with 403 (not 401 — they ARE authenticated)', () => {
    expect(() => guard.canActivate(ctxWithUser(memberUser))).toThrow(ForbiddenException);
  });

  it('blocks a request with no req.user at all (guard misapplied without JwtAuthGuard first)', () => {
    expect(() => guard.canActivate(ctxWithUser(undefined))).toThrow(ForbiddenException);
  });
});
