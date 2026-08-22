import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersRepository, type PublicUser } from '../users/users.repository';
import { TokenService } from './token.service';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthedRequest = Request & { user?: PublicUser };

/**
 * Required-auth guard: verifies the Bearer access token and resolves its `sub`
 * (public_id) to the user, attaching {id, publicId, email, role} to req.user.
 * Wired globally in T-057 (APP_GUARD); protected routes opt out via a `@Public()`
 * marker (see public.decorator). On a `@Public()` route it never throws — but it
 * STILL attaches req.user when a valid Bearer token happens to be present, so
 * optional personalization (e.g. GET /scans/:id) keeps working. On a non-public
 * route it enforces strict auth exactly as before.
 * (Implemented as a Nest guard using TokenService rather than a passport-jwt
 * strategy — same behavior, one fewer dependency; see also common/auth for the
 * optional/guest-allowed resolver.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];

    if (isPublic) {
      // Guest-reachable route: never reject, but best-effort attach the user so
      // optional personalization still sees an authenticated principal.
      await this.attachUserIfPresent(req, header);
      return true;
    }

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const claims = this.tokens.verifyAccess(header.slice('Bearer '.length).trim());
    if (!claims) throw new UnauthorizedException();

    const user = await this.users.findByPublicId(claims.sub);
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }

  /** Attaches req.user for a valid Bearer token; a no-op (never throws) otherwise. */
  private async attachUserIfPresent(req: AuthedRequest, header: string | undefined): Promise<void> {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return;
    const claims = this.tokens.verifyAccess(header.slice('Bearer '.length).trim());
    if (!claims) return;
    const user = await this.users.findByPublicId(claims.sub);
    if (user) req.user = user;
  }
}
