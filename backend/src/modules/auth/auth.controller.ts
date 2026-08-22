import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginRequestSchema, registerRequestSchema, type AuthTokenResponse } from 'shared';
import { AuthService, type IssuedTokens } from './auth.service';
import { Public } from './public.decorator';

const REFRESH_COOKIE = 'refresh-token';
const GUEST_COOKIE = 'guest-id';

/**
 * Auth routes (register/login/refresh/logout). Access token is returned in the
 * body; the refresh token rides in an httpOnly cookie. T-057 registers the
 * global JwtAuthGuard; register/login/refresh carry `@Public()` (they must be
 * reachable before the caller has a token). `logout` is intentionally NOT
 * `@Public()` — it stays protected, matching the OpenAPI contract (logout is not
 * `security: []`).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const parsed = registerRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    const guestSessionId = this.readCookie(req, GUEST_COOKIE);
    const tokens = await this.auth.register(
      parsed.data.email,
      parsed.data.password,
      guestSessionId,
    );
    return this.respond(res, tokens);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    const tokens = await this.auth.login(parsed.data.email, parsed.data.password);
    return this.respond(res, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const tokens = await this.auth.refresh(this.readCookie(req, REFRESH_COOKIE) ?? undefined);
    return this.respond(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readCookie(req, REFRESH_COOKIE) ?? undefined);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  private respond(res: Response, tokens: IssuedTokens): AuthTokenResponse {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * Number(process.env.REFRESH_TOKEN_TTL ?? 2592000),
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }

  private readCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }
}
