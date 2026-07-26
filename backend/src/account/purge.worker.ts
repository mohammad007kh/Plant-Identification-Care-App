import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';
import type { PurgeJobData } from './deletion.queue';
import { DeletionService } from './deletion.service';

/**
 * BullMQ worker that drains the delayed `purge` job off the `purge` queue and
 * hands it to `DeletionService.purgeUser` (all business logic lives there so
 * it's directly unit-testable). Connects to Redis at module init (runtime
 * only); tests set `DISABLE_WORKERS=1` and call `DeletionService.purgeUser`
 * directly — mirrors `IdentifyWorker` (T-020).
 */
@Injectable()
export class PurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PurgeWorker.name);
  private worker?: Worker;

  constructor(private readonly deletion: DeletionService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.worker = new Worker(
      QUEUE_NAMES.purge,
      async (job) => {
        await this.deletion.purgeUser((job.data as PurgeJobData).userId);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) => this.logger.error(`purge job failed: ${err?.message}`));
    this.logger.log('Purge worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
