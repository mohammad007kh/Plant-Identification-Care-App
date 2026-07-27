import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './common/config/app-config.module';
import { ProblemDetailsFilter } from './common/filters/problem.filter';
import { HealthModule } from './modules/health/health.module';
import { CreditsModule } from './credits/credits.module';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { JobsModule } from './jobs/jobs.module';
import { AnalyticsModule } from './analytics/analytics.module';
// Feature modules — registered by the per-US wiring tasks
// (T-037/057/077/097/107/117/127/137/147).
import { ScansModule } from './modules/scans/scans.module';
import { GuestsModule } from './modules/guests/guests.module';
import { MisidentificationReportsModule } from './modules/misidentification-reports/misidentification-reports.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlantsModule } from './modules/plants/plants.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DeletionModule } from './account/deletion.module';
import { AdminModule } from './admin/admin.module';

/**
 * Root application module — the composition root of the modular monolith. Every
 * feature module is registered here. Route-level `@UseGuards(JwtAuthGuard)` /
 * `@OptionalUserId()` already enforce auth per endpoint, so NO global auth guard
 * is registered — a global guard would need a `@Public()` allowlist to keep the
 * guest-allowed scan submission and the public auth routes reachable.
 */
@Module({
  imports: [
    // Infrastructure / cross-cutting
    AppConfigModule,
    HealthModule,
    CreditsModule,
    AiGatewayModule,
    JobsModule,
    AnalyticsModule,
    // US1 — identify
    ScansModule,
    GuestsModule,
    MisidentificationReportsModule,
    // US2 — auth
    AuthModule,
    // US3 — plants (US5 comparison providers live inside PlantsModule)
    PlantsModule,
    // US4 — billing
    SubscriptionsModule,
    PaymentsModule,
    // US6 — chat
    ChatModule,
    // US7 — notifications
    NotificationsModule,
    // US8 — account deletion
    DeletionModule,
    // US9 — admin
    AdminModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
