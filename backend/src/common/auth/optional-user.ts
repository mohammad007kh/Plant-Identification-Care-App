import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/**
 * Minimal OPTIONAL actor resolution for guest-allowed endpoints (T-020).
 *
 * The full auth surface (register/login/refresh) is T-040 (US2); it will issue
 * access tokens signed with `JWT_ACCESS_SECRET`. This resolver only *verifies* a
 * bearer token if one is present, so the authenticated-vs-guest branch works and
 * is testable today — no token, bad token, or no secret → `null` (treated as a
 * guest). It never throws, so a guest request is never rejected here.
 */
export function resolveUserIdFromAuthHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!token || !secret) return null;
  try {
    // Pin the algorithm allowlist explicitly (never rely on library defaults):
    // access tokens are HMAC-signed with a shared secret. This forecloses any
    // `alg` confusion since who-gets-billed depends on this. T-040 will add
    // issuer/type-claim checks once it defines the full token shape.
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'object' && payload !== null && typeof payload.sub === 'string') {
      return payload.sub;
    }
    return null;
  } catch {
    return null;
  }
}

/** Param decorator: injects the authenticated user's id, or `null` for a guest. */
export const OptionalUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    return resolveUserIdFromAuthHeader(req.headers['authorization']);
  },
);
