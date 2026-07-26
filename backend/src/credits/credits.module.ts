import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { CreditLedgerRepository } from './credit-ledger.repository';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

/**
 * Credits/billing ledger module (T-015 foundation). T-080 adds the
 * `GET /v1/credits/balance` route, hence the `AuthModule` import (for
 * `JwtAuthGuard`/`CurrentUserId` — same pattern as `PlantsModule`).
 */
@Module({
  imports: [AuthModule],
  controllers: [CreditsController],
  providers: [CreditLedgerRepository, CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
