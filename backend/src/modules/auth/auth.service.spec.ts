import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import type { UsersRepository } from '../users/users.repository';
import type { PasswordHasherService } from './password-hasher.service';
import type { RefreshTokenRepository } from './refresh-token.repository';
import type { CredentialVerifier } from './credential-verifier';
import type { UserRegisteredHook } from './user-registered.hook';

// Env secrets are provided by the root vitest config (test.env).
const tokens = new TokenService();

/** In-memory refresh store that mimics the Redis allowlist + atomic consume. */
function makeRefreshStore() {
  const store = new Map<string, string>();
  return {
    store,
    allow: vi.fn(async (jti: string, publicId: string) => {
      store.set(jti, publicId);
    }),
    consume: vi.fn(async (jti: string) => {
      const v = store.get(jti) ?? null;
      store.delete(jti);
      return v;
    }),
    revoke: vi.fn(async (jti: string) => {
      store.delete(jti);
    }),
  };
}

const USER = { id: 'u1', publicId: 'p1', email: 'a@b.co', role: 'user' as const };

describe('AuthService (T-040, FR-007)', () => {
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByPublicId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let hasher: { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let refresh: ReturnType<typeof makeRefreshStore>;
  let verifier: { verify: ReturnType<typeof vi.fn> };
  let hook: { onUserRegistered: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByPublicId: vi.fn().mockResolvedValue(USER),
      create: vi.fn().mockResolvedValue(USER),
    };
    hasher = { hash: vi.fn().mockResolvedValue('hash'), verify: vi.fn().mockResolvedValue(true) };
    refresh = makeRefreshStore();
    verifier = {
      verify: vi.fn().mockResolvedValue({ userId: 'u1', publicId: 'p1', role: 'user' }),
    };
    hook = { onUserRegistered: vi.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasherService,
      tokens,
      refresh as unknown as RefreshTokenRepository,
      verifier as unknown as CredentialVerifier,
      hook as unknown as UserRegisteredHook,
    );
  });

  it('register hashes the password, fires the hook, and issues tokens', async () => {
    const res = await service.register('a@b.co', 'secret123', 'guest-1');
    expect(hasher.hash).toHaveBeenCalledWith('secret123');
    expect(hook.onUserRegistered).toHaveBeenCalledWith({ userId: 'u1', guestSessionId: 'guest-1' });
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(refresh.store.size).toBe(1); // refresh token allowlisted
  });

  it('register rejects a duplicate email with 409', async () => {
    users.findByEmail.mockResolvedValue(USER);
    await expect(service.register('a@b.co', 'secret123', null)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.create).not.toHaveBeenCalled();
  });

  it('login rejects bad credentials with 401', async () => {
    verifier.verify.mockResolvedValue(null);
    await expect(service.login('a@b.co', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the token: the old refresh token is single-use', async () => {
    const issued = await service.login('a@b.co', 'secret123');
    const rotated = await service.refresh(issued.refreshToken);
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);

    // Replaying the ORIGINAL refresh token now fails (its jti was consumed).
    await expect(service.refresh(issued.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout revokes the refresh token so it can never be replayed', async () => {
    const issued = await service.login('a@b.co', 'secret123');
    await service.logout(issued.refreshToken);
    await expect(service.refresh(issued.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh with a missing/garbage token is 401', async () => {
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
