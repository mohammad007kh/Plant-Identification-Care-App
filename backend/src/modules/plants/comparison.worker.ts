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
 * NOTE: `identify` (T-020) jobs and `comparison` (T-060) jobs are both
 * enqueued onto the same `ai` queue name (jobs/queues.ts), distinguished only
 * by BullMQ job name. This worker filters on `job.name === 'comparison'` so
 * it never misinterprets an identify job's payload; wiring both workers to
 * coexist safely on the shared queue (and not double-process a job) is
 * T-107's responsibility (worker registration is out of scope here — this
 * module is not imported by app.module yet).
 */
@Injectable()
export class ComparisonWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComparisonWorker.name);
  private worker?: Worker;

  constructor(private readonly comparison: ComparisonService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.worker = new Worker(
      QUEUE_NAMES.ai,
      async (job) => {
        if (job.name !== 'comparison') return;
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
