import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { verifyAccessToken } from './access-token';

/**
 * Minimal OPTIONAL actor resolution for guest-allowed endpoints (T-020/T-021).
 *
 * Delegates to the shared access-token verifier (single source of truth — HS256,
 * `typ: 'access'`) and returns its `sub` (the user's public_id, never the
 * internal id). No/invalid token → null. Never throws, so a guest is never
 * rejected here.
 */
export function resolvePublicIdFromAuthHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const claims = verifyAccessToken(authHeader.slice('Bearer '.length).trim());
  return claims?.sub ?? null;
}

/**
 * Param decorator: injects the authenticated user's INTERNAL id (resolved from
 * the token's public_id `sub`), or `null` for a guest. Downstream code (credit
 * ledger, scan ownership) keys on the internal id, never the public_id.
 */
export const OptionalUserId = createParamDecorator(
  async (_data: unknown, ctx: ExecutionContext): Promise<string | null> => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const publicId = resolvePublicIdFromAuthHeader(req.headers['authorization']);
    if (!publicId) return null;
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    return row?.id ?? null;
  },
);
