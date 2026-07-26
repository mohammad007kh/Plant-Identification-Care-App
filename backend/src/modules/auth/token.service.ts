import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ulid } from 'ulid';
import { verifyAccessToken, type AccessClaims } from '../../common/auth/access-token';

export type { AccessClaims };

const ACCESS_TTL = Number(process.env.ACCESS_TOKEN_TTL ?? 900); // 15 min
const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_TTL ?? 2592000); // 30 days

export interface RefreshClaims {
  sub: string;
  jti: string;
}

/**
 * Signs/verifies JWTs. Access tokens are short-lived HS256 tokens whose `sub` is
 * the user's public_id (never the internal id — domain rule). Refresh tokens
 * carry a `jti` so the server can rotate/revoke them via the refresh-token store.
 */
@Injectable()
export class TokenService {
  get accessTtl(): number {
    return ACCESS_TTL;
  }
  get refreshTtl(): number {
    return REFRESH_TTL;
  }

  signAccess(publicId: string, role: string): string {
    return jwt.sign({ role, typ: 'access' }, this.accessSecret(), {
      subject: publicId,
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL,
    });
  }

  signRefresh(publicId: string): { token: string; jti: string } {
    const jti = ulid();
    const token = jwt.sign({ jti, typ: 'refresh' }, this.refreshSecret(), {
      subject: publicId,
      algorithm: 'HS256',
      expiresIn: REFRESH_TTL,
    });
    return { token, jti };
  }

  verifyAccess(token: string): AccessClaims | null {
    return verifyAccessToken(token);
  }

  verifyRefresh(token: string): RefreshClaims | null {
    try {
      const p = jwt.verify(token, this.refreshSecret(), { algorithms: ['HS256'] });
      if (
        typeof p === 'object' &&
        p !== null &&
        typeof p.sub === 'string' &&
        typeof (p as { jti?: unknown }).jti === 'string' &&
        (p as { typ?: unknown }).typ === 'refresh'
      ) {
        return { sub: p.sub, jti: (p as { jti: string }).jti };
      }
      return null;
    } catch {
      return null;
    }
  }

  private accessSecret(): string {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s) throw new Error('JWT_ACCESS_SECRET is not configured');
    return s;
  }

  private refreshSecret(): string {
    const s = process.env.JWT_REFRESH_SECRET;
    if (!s) throw new Error('JWT_REFRESH_SECRET is not configured');
    return s;
  }
}
