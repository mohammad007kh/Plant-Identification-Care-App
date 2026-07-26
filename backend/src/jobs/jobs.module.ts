import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationWorker } from './reconciliation.worker';
import { MonthlyCreditResetRepository } from './monthly-credit-reset.repository';
import { MonthlyCreditResetProcessor } from './monthly-credit-reset.processor';
import { MonthlyCreditResetScheduler } from './monthly-credit-reset.scheduler';

/**
 * Background job engine (BullMQ). Hosts the credit reconciliation sweep and
 * the monthly credit-reset scheduler (T-082, FR-019); feature tasks add the
 * ai / reminders / purge queues + workers.
 */
@Module({
  imports: [CreditsModule],
  providers: [
    ReconciliationService,
    ReconciliationWorker,
    MonthlyCreditResetRepository,
    MonthlyCreditResetProcessor,
    MonthlyCreditResetScheduler,
  ],
  exports: [ReconciliationService, MonthlyCreditResetProcessor],
})
export class JobsModule {}
