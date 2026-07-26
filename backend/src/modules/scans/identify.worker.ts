import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../../jobs/queues';
import { IdentifyService } from './identify.service';
import type { IdentifyJobData } from './identify.queue';

/**
 * BullMQ worker that drains `identify` jobs off the `ai` queue and hands each to
 * IdentifyService. Connects to Redis at module init (runtime only); tests set
 * `DISABLE_WORKERS=1` and invoke IdentifyService.process directly.
 */
@Injectable()
export class IdentifyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdentifyWorker.name);
  private worker?: Worker;

  constructor(private readonly identify: IdentifyService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.worker = new Worker(
      QUEUE_NAMES.ai,
      async (job) => {
        await this.identify.process(job.data as IdentifyJobData);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`identify job failed: ${err?.message}`),
    );
    this.logger.log('Identify worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
