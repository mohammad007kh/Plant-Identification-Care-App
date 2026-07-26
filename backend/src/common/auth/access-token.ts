import * as jwt from 'jsonwebtoken';

export interface AccessClaims {
  /** The user's opaque public_id (never the internal id). */
  sub: string;
  role: string;
}

/**
 * Single source of truth for access-token verification (used by both the
 * required-auth guard via TokenService and the guest-allowed optional resolver,
 * so the two can never drift). Pins HS256 and requires an explicit
 * `typ: 'access'` claim, so a refresh token can never be replayed as an access
 * token even if the two signing secrets were ever misconfigured to match.
 * Never throws — returns null on any invalid/expired/forged token.
 */
export function verifyAccessToken(token: string): AccessClaims | null {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!token || !secret) return null;
  try {
    const p = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (
      typeof p === 'object' &&
      p !== null &&
      typeof p.sub === 'string' &&
      (p as { typ?: unknown }).typ === 'access'
    ) {
      const role = (p as { role?: unknown }).role;
      return { sub: p.sub, role: typeof role === 'string' ? role : 'user' };
    }
    return null;
  } catch {
    return null;
  }
}
