import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationWorker } from './reconciliation.worker';

/**
 * Background job engine (BullMQ). Currently hosts the credit reconciliation
 * sweep; feature tasks add the ai / reminders / purge queues + workers.
 */
@Module({
  imports: [CreditsModule],
  providers: [ReconciliationService, ReconciliationWorker],
  exports: [ReconciliationService],
})
export class JobsModule {}
