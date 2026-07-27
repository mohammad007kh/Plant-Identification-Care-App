import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { CreditCheckGuard } from '../../common/guards/credit-check.guard';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { CreditsModule } from '../../credits/credits.module';
import { AiGatewayModule } from '../../ai-gateway/ai-gateway.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuthModule } from '../auth/auth.module';
import { PlantsController } from './plants.controller';
import { PlantsService } from './plants.service';
import { PlantsRepository } from './plants.repository';
import { ComparisonQueue } from './comparison.queue';
import { ComparisonService } from './comparison.service';
import { ComparisonRepository } from './comparison.repository';
import { ComparisonWorker } from './comparison.worker';

/**
 * US3 plants feature module (T-060): save/list/get plants + follow-up photo
 * history. Imports AuthModule for JwtAuthGuard/CurrentUserId (every route is
 * user-scoped) and UploadsModule for image validation + storage.
 * CreditsModule/AppConfigModule/SubscriptionsModule back `CreditCheckGuard`
 * (T-082), applied to the follow-up-photo (comparison) route. NOT imported by
 * app.module here — T-097 registers it alongside the rest of the plants surface.
 */
@Module({
  imports: [
    AuthModule,
    UploadsModule,
    CreditsModule,
    AppConfigModule,
    SubscriptionsModule,
    AiGatewayModule,
  ],
  controllers: [PlantsController],
  providers: [
    PlantsService,
    PlantsRepository,
    ComparisonQueue,
    CreditCheckGuard,
    // US5 health comparison (T-100) — registered here in T-107 wiring so the
    // comparison worker consumes the `comparison` jobs the photo route enqueues.
    ComparisonService,
    ComparisonRepository,
    ComparisonWorker,
  ],
  exports: [PlantsService, PlantsRepository, ComparisonService],
})
export class PlantsModule {}
