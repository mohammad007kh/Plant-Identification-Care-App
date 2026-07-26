import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';

/**
 * Cross-cutting analytics module (T-160, FR-028, Station 16). Marked
 * `@Global()` so `AnalyticsService` is injectable from any feature module
 * (ai-gateway, auth, payments, notifications, ...) without each one adding
 * `AnalyticsModule` to its own `imports`.
 *
 * NOT wired into `app.module.ts` by this task — Nest still requires a
 * global module to be imported ONCE somewhere in the tree for its providers
 * to register. That single import (`imports: [AnalyticsModule, ...]` in
 * `backend/src/app.module.ts`) is an integration step performed separately;
 * see the T-160 completion notes for the exact call sites each feature
 * module must add once this module is registered.
 */
@Global()
@Module({
  providers: [AnalyticsService, AnalyticsRepository],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
