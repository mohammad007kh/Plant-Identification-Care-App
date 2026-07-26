import { Controller, Get, UseGuards } from '@nestjs/common';
import type { CreditBalance } from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { CreditsService } from './credits.service';

/**
 * `GET /v1/credits/balance` (T-080, FR-014/FR-016): the authenticated caller's
 * current credit balance + subscription tier. Reads the denormalized
 * `credit_balance` cache (not a live ledger SUM — that's the reconciliation
 * job's job) alongside the user's tier. `userId` always comes from the
 * verified JWT principal (`@CurrentUserId()`), never a request param. Not
 * registered in app.module here — T-097 wires it.
 */
@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('balance')
  getBalance(@CurrentUserId() userId: string): Promise<CreditBalance> {
    return this.credits.getBalanceAndTier(userId);
  }
}
