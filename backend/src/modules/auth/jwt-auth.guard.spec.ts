import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';
import { UsersRepository, type PublicUser } from '../users/users.repository';
import type { AccessClaims } from '../../common/auth/access-token';
import { Public } from './public.decorator';

const USER: PublicUser = { id: 'u1', publicId: 'pub-1', email: 'a@b.co', role: 'user' };
const CLAIMS: AccessClaims = { sub: 'pub-1', role: 'user' };

type FakeReq = { headers: Record<string, string | undefined>; user?: PublicUser };

function makeCtx(header?: string): { ctx: ExecutionContext; req: FakeReq } {
  const req: FakeReq = { headers: { authorization: header } };
  const ctx = {
    getHandler: () => (): void => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(opts: {
  isPublic: boolean;
  claims?: AccessClaims | null;
  user?: PublicUser | null;
}): {
  guard: JwtAuthGuard;
  verifyAccess: ReturnType<typeof vi.fn>;
  findByPublicId: ReturnType<typeof vi.fn>;
} {
  const verifyAccess = vi.fn().mockReturnValue(opts.claims ?? null);
  const findByPublicId = vi.fn().mockResolvedValue(opts.user ?? null);
  const tokens = { verifyAccess } as unknown as TokenService;
  const users = { findByPublicId } as unknown as UsersRepository;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.isPublic),
  } as unknown as Reflector;
  return { guard: new JwtAuthGuard(tokens, users, reflector), verifyAccess, findByPublicId };
}

describe('JwtAuthGuard (T-057 — global guard + @Public opt-out)', () => {
  it('(a) @Public route with NO token → allowed, req.user undefined', async () => {
    const { guard, verifyAccess } = makeGuard({ isPublic: true });
    const { ctx, req } = makeCtx(undefined);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
    expect(verifyAccess).not.toHaveBeenCalled();
  });

  it('(b) @Public route WITH a valid token → allowed, req.user attached', async () => {
    const { guard } = makeGuard({ isPublic: true, claims: CLAIMS, user: USER });
    const { ctx, req } = makeCtx('Bearer good-token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual(USER);
  });

  it('@Public route with an INVALID token → allowed, req.user undefined (never throws)', async () => {
    const { guard } = makeGuard({ isPublic: true, claims: null });
    const { ctx, req } = makeCtx('Bearer bogus');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('(c) non-public route with NO token → 401', async () => {
    const { guard } = makeGuard({ isPublic: false });
    const { ctx } = makeCtx(undefined);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('(d) non-public route with a valid token → allowed, req.user attached', async () => {
    const { guard } = makeGuard({ isPublic: false, claims: CLAIMS, user: USER });
    const { ctx, req } = makeCtx('Bearer good-token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual(USER);
  });

  it('non-public route with an invalid token → 401', async () => {
    const { guard } = makeGuard({ isPublic: false, claims: null });
    const { ctx } = makeCtx('Bearer bogus');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('non-public route: valid claims but unknown user → 401', async () => {
    const { guard } = makeGuard({ isPublic: false, claims: CLAIMS, user: null });
    const { ctx } = makeCtx('Bearer good-token');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

class Probe {
  @Public()
  publicHandler(): void {
    return undefined;
  }

  privateHandler(): void {
    return undefined;
  }
}

function probeCtx(handler: () => void, header?: string): { ctx: ExecutionContext; req: FakeReq } {
  const req: FakeReq = { headers: { authorization: header } };
  const ctx = {
    getHandler: () => handler,
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('APP_GUARD DI wiring (useExisting) + real Reflector reads @Public metadata', () => {
  it('compiles the { provide: APP_GUARD, useExisting: JwtAuthGuard } graph and injects a working Reflector', async () => {
    // compile() succeeds only if the useExisting alias resolves to a real
    // provider — this proves the app.module wiring is valid. We then exercise
    // the module-resolved guard with the REAL Reflector against an actual
    // @Public()-decorated handler (mirrors app.module: AuthModule provides deps).
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: TokenService, useValue: { verifyAccess: vi.fn() } },
        { provide: UsersRepository, useValue: { findByPublicId: vi.fn() } },
        JwtAuthGuard,
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
      ],
    }).compile();

    const guard = moduleRef.get(JwtAuthGuard);
    expect(guard).toBeInstanceOf(JwtAuthGuard);
    expect(moduleRef.get(Reflector)).toBeInstanceOf(Reflector);

    const probe = new Probe();

    // @Public() handler, no token → allowed without throwing (real metadata read).
    const publicReq = probeCtx(probe.publicHandler, undefined);
    await expect(guard.canActivate(publicReq.ctx)).resolves.toBe(true);
    expect(publicReq.req.user).toBeUndefined();

    // Non-decorated handler, no token → strict path → 401.
    const privateReq = probeCtx(probe.privateHandler, undefined);
    await expect(guard.canActivate(privateReq.ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
