/**
 * Best-effort, UNVERIFIED decode of the access JWT's `role` claim
 * (`backend/src/common/auth/access-token.ts` `AccessClaims.role`), used ONLY
 * to decide whether the `/admin` route group's UI renders — the real
 * boundary is the backend `AdminGuard` (T-140/T-141), which independently
 * verifies the signature on every admin request. Never throws: a malformed,
 * expired, or foreign token degrades to `null`, which callers must treat the
 * same as "not an admin".
 */
export function getRoleFromAccessToken(accessToken: string | null): string | null {
  if (!accessToken) return null;

  const segments = accessToken.split('.');
  if (segments.length !== 3) return null;

  try {
    const base64Url = segments[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    const payload: unknown = JSON.parse(json);

    if (typeof payload !== 'object' || payload === null) return null;

    const role = (payload as Record<string, unknown>).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/** `true` only when the decoded `role` claim is exactly `'admin'` (`shared`'s `adminUserSummarySchema.role` enum). */
export function isAdminAccessToken(accessToken: string | null): boolean {
  return getRoleFromAccessToken(accessToken) === 'admin';
}
