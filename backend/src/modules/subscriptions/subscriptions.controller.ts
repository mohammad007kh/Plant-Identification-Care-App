import { Controller, Get } from '@nestjs/common';
import type { Plan } from 'shared';
import { SubscriptionsService } from './subscriptions.service';

/**
 * `GET /v1/subscriptions/plans` (T-080, FR-016) — unauthenticated per contract
 * `security: []` (pre-registration visitors also see plans). Backs the
 * upgrade modal (T-083). Not registered in app.module here — T-097 wires it.
 */
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  listPlans(): Promise<Plan[]> {
    return this.subscriptions.listActivePlans();
  }
}
