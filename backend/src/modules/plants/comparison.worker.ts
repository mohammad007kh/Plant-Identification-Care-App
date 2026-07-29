import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../../jobs/queues';
import { ComparisonService } from './comparison.service';
import type { ComparisonJobData } from './comparison.queue';

/**
 * BullMQ worker that drains `comparison` jobs off the shared `ai` queue and
 * hands each to ComparisonService. Connects to Redis at module init (runtime
 * only); tests set `DISABLE_WORKERS=1` and invoke ComparisonService.process
 * directly (mirrors scans/IdentifyWorker, T-020).
 *
 * Consumes the dedicated `comparison` queue — NOT the shared `ai` queue.
 * Sharing `ai` was a silent-data-loss bug: IdentifyWorker does not filter by
 * job.name, so the two workers popped (and dropped, on a no-op return) each
 * other's jobs, stalling ~half of all identifications. Isolating the queue
 * removes the race entirely (jobs/queues.ts). Tests set `DISABLE_WORKERS=1`
 * and invoke ComparisonService.process directly (mirrors scans/IdentifyWorker).
 */
@Injectable()
export class ComparisonWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComparisonWorker.name);
  private worker?: Worker;

  constructor(private readonly comparison: ComparisonService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.worker = new Worker(
      QUEUE_NAMES.comparison,
      async (job) => {
        await this.comparison.process(job.data as ComparisonJobData);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`comparison job failed: ${err?.message}`),
    );
    this.logger.log('Comparison worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
