import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { isUniqueViolation } from '../../credits/db-errors';
import { UsersRepository } from '../users/users.repository';
import { PasswordHasherService } from './password-hasher.service';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { CREDENTIAL_VERIFIER, type CredentialVerifier } from './credential-verifier';
import { USER_REGISTERED_HOOK, type UserRegisteredHook } from './user-registered.hook';

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

/**
 * JWT auth core (FR-007). Short-lived access token + rotating refresh token
 * backed by a Redis allowlist (rotation invalidates the old jti atomically;
 * logout revokes it). Passwords are argon2id. `password_hash` is never returned.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: TokenService,
    private readonly refreshStore: RefreshTokenRepository,
    @Inject(CREDENTIAL_VERIFIER) private readonly verifier: CredentialVerifier,
    @Inject(USER_REGISTERED_HOOK) private readonly onRegistered: UserRegisteredHook,
  ) {}

  async register(
    email: string,
    password: string,
    guestSessionId: string | null,
  ): Promise<IssuedTokens> {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException({ code: 'email_taken', detail: 'این ایمیل قبلاً ثبت شده است.' });
    }

    const passwordHash = await this.hasher.hash(password);
    let user;
    try {
      user = await this.users.create(email, passwordHash);
    } catch (err) {
      // Race: a concurrent registration with the same email won the unique index.
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'email_taken',
          detail: 'این ایمیل قبلاً ثبت شده است.',
        });
      }
      throw err;
    }

    // Synchronous hook (guest-scan merge, T-041) — runs before the response.
    await this.onRegistered.onUserRegistered({ userId: user.id, guestSessionId });

    return this.issue(user.publicId, user.role);
  }

  async login(email: string, password: string): Promise<IssuedTokens> {
    const cred = await this.verifier.verify(email, password);
    if (!cred)
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        detail: 'ایمیل یا رمز عبور نادرست است.',
      });
    return this.issue(cred.publicId, cred.role);
  }

  /**
   * Rotate: atomically consume the presented refresh token's jti (GETDEL). If it
   * was already used/revoked, `consume` returns null → 401. Otherwise issue a
   * fresh access + refresh pair (new jti), invalidating the old one.
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    const claims = refreshToken ? this.tokens.verifyRefresh(refreshToken) : null;
    if (!claims)
      throw new UnauthorizedException({ code: 'invalid_refresh', detail: 'نشست منقضی شده است.' });

    const publicId = await this.refreshStore.consume(claims.jti);
    if (!publicId || publicId !== claims.sub) {
      throw new UnauthorizedException({ code: 'invalid_refresh', detail: 'نشست منقضی شده است.' });
    }

    const user = await this.users.findByPublicId(publicId);
    if (!user)
      throw new UnauthorizedException({ code: 'invalid_refresh', detail: 'نشست منقضی شده است.' });

    return this.issue(user.publicId, user.role);
  }

  /** Revoke the presented refresh token so it can never be replayed. Idempotent. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const claims = this.tokens.verifyRefresh(refreshToken);
    if (claims) await this.refreshStore.revoke(claims.jti);
  }

  private async issue(publicId: string, role: string): Promise<IssuedTokens> {
    const accessToken = this.tokens.signAccess(publicId, role);
    const { token: refreshToken, jti } = this.tokens.signRefresh(publicId);
    await this.refreshStore.allow(jti, publicId, this.tokens.refreshTtl);
    return { accessToken, expiresIn: this.tokens.accessTtl, refreshToken };
  }
}
