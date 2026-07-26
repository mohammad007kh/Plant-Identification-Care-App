import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from './queues';
import { ReconciliationService } from './reconciliation.service';

const RECONCILE_EVERY_MS = Number(process.env.RECONCILE_EVERY_MS ?? 60 * 1000);

/**
 * Registers a repeatable BullMQ job that periodically runs the reconciliation
 * sweep. Connects to Redis at module init (runtime only — not imported by unit
 * tests, which exercise ReconciliationService.sweepStuckUsageRecords directly).
 */
@Injectable()
export class ReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly reconciliation: ReconciliationService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.queue = new Queue(QUEUE_NAMES.reconcile, { connection: createRedisConnection() });
    await this.queue.add(
      'sweep',
      {},
      { repeat: { every: RECONCILE_EVERY_MS }, removeOnComplete: true, removeOnFail: 100 },
    );
    this.worker = new Worker(
      QUEUE_NAMES.reconcile,
      async () => {
        await this.reconciliation.sweepStuckUsageRecords();
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`reconcile job failed: ${err?.message}`),
    );
    this.logger.log(`Reconciliation worker started (every ${RECONCILE_EVERY_MS}ms).`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
