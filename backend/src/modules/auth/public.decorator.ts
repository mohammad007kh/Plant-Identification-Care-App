import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Reflector metadata key marking a route (handler or controller) as guest-reachable. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt-out marker for the global `JwtAuthGuard` (wired in T-057): a `@Public()`
 * handler (or controller) is reachable WITHOUT a valid access token. The global
 * guard still best-effort attaches `req.user` when a valid Bearer token is
 * present (so optional personalization keeps working), but never throws on a
 * missing/invalid token for a public route. Non-public routes keep the strict
 * required-auth behavior. Applies to a method or a whole controller class.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
