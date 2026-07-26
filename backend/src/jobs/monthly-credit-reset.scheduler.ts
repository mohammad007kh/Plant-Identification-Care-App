import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from './queues';
import { MonthlyCreditResetProcessor } from './monthly-credit-reset.processor';

const RESET_TICK_EVERY_MS = Number(process.env.MONTHLY_RESET_TICK_MS ?? 24 * 60 * 60 * 1000); // daily

/**
 * Registers a repeatable BullMQ job (`infrastructure.scheduling: app_scheduler`)
 * that ticks daily and runs the monthly credit reset for the current UTC
 * cycle. Connects to Redis at module init (runtime only — DISABLE_WORKERS
 * guarded, and never imported by unit tests, which exercise
 * `MonthlyCreditResetProcessor.runCycle` directly).
 */
@Injectable()
export class MonthlyCreditResetScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonthlyCreditResetScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly processor: MonthlyCreditResetProcessor) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_WORKERS === '1') return;

    this.queue = new Queue(QUEUE_NAMES.monthlyReset, { connection: createRedisConnection() });
    await this.queue.add(
      'tick',
      {},
      { repeat: { every: RESET_TICK_EVERY_MS }, removeOnComplete: true, removeOnFail: 100 },
    );
    this.worker = new Worker(
      QUEUE_NAMES.monthlyReset,
      async () => {
        const cycleKey = MonthlyCreditResetProcessor.cycleKeyFor(new Date());
        const { processed, failed } = await this.processor.runCycle(cycleKey);
        this.logger.log(
          `monthly reset tick (${cycleKey}): ${processed} processed, ${failed} failed`,
        );
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`monthly reset tick failed: ${err?.message}`),
    );
    this.logger.log(`Monthly credit reset scheduler started (every ${RESET_TICK_EVERY_MS}ms).`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
