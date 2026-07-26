import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CreditsService, type UsageAction } from '../../credits/credits.service';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service';
import { AppConfigService } from '../config/app-config.service';
import { CREDIT_COST_ACTION_KEY } from '../decorators/credit-cost.decorator';
import { InsufficientCreditException } from '../exceptions/insufficient-credit.exception';

type AuthedRequest = Request & { user?: { id: string } };

/**
 * Blocks a metered AI action server-side, BEFORE the controller method body
 * runs, when the caller lacks sufficient credit (Station 10 §10.6.1 — never
 * just a UI-side check). Apply at the METHOD level via `@UseGuards` alongside
 * `@CreditCost(...)`, on a route whose controller already carries
 * `@UseGuards(JwtAuthGuard)` — this guard reads `req.user`, set by
 * `JwtAuthGuard`, which MUST run first.
 *
 * On insufficient credit: throws `InsufficientCreditException` (402) carrying
 * the live plans payload, so the frontend upgrade modal (T-083) renders with
 * no second fetch. If `app_config`'s credit costs are unreadable, the read
 * throws and propagates as a loud RFC7807 500 (AppConfigService's own
 * fail-fast convention) — the action is still blocked, never silently allowed.
 */
@Injectable()
export class CreditCheckGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly credits: CreditsService,
    private readonly config: AppConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<UsageAction | undefined>(
      CREDIT_COST_ACTION_KEY,
      ctx.getHandler(),
    );
    if (!action) return true; // route is not @CreditCost-annotated — nothing to guard

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const costs = await this.config.getCreditCosts();
    const cost = costs[action];

    const balance = await this.credits.getBalance(userId);
    if (balance < cost) {
      const plans = await this.subscriptions.listActivePlans();
      throw new InsufficientCreditException(plans);
    }
    return true;
  }
}
