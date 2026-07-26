import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { UsersRepository, type PublicUser } from '../users/users.repository';
import { TokenService } from './token.service';

type AuthedRequest = Request & { user?: PublicUser };

/**
 * Required-auth guard: verifies the Bearer access token and resolves its `sub`
 * (public_id) to the user, attaching {id, publicId, email, role} to req.user.
 * Wired globally in T-057; protected routes opt out via a @Public() marker there.
 * (Implemented as a Nest guard using TokenService rather than a passport-jwt
 * strategy — same behavior, one fewer dependency; see also common/auth for the
 * optional/guest-allowed resolver.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
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
}
