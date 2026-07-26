import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * Public subscription-plans module (T-080). NOT imported by app.module here
 * — T-097 registers it alongside the rest of the billing surface. Exported so
 * `CreditCheckGuard` (T-082) can reuse `listActivePlans()` for its 402 payload.
 */
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
