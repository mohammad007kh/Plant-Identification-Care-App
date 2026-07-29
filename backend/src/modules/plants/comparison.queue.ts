import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../../jobs/queues';

export interface ComparisonJobData {
  /** Internal scan ULID (not the public UUID). */
  scanId: string;
}

/**
 * Producer for the async `comparison` job on the dedicated `comparison` queue,
 * enqueued by `POST /v1/plants/:id/photos` (follow-up photo comparison, FR-010).
 * Uses its own queue (NOT the shared `ai` queue) so ComparisonWorker and
 * IdentifyWorker never pop each other's jobs — see jobs/queues.ts. Mirrors
 * scans/IdentifyQueue.
 */
@Injectable()
export class ComparisonQueue implements OnModuleDestroy {
  private queue?: Queue;

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.comparison, { connection: createRedisConnection() });
    }
    return this.queue;
  }

  async enqueueComparison(data: ComparisonJobData): Promise<void> {
    await this.getQueue().add('comparison', data, { removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
