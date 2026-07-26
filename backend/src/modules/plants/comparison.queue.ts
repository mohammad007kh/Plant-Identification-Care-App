import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../../jobs/queues';

export interface ComparisonJobData {
  /** Internal scan ULID (not the public UUID). */
  scanId: string;
}

/**
 * Producer for the async `comparison` job on the shared `ai` queue, enqueued by
 * `POST /v1/plants/:id/photos` (follow-up photo comparison, FR-010). Only the
 * enqueue side is implemented here — the consumer (AI comparison call, credit
 * settle) is US5/T-08x scope; this gives that future task a stable job to pick
 * up without restructuring this controller/service. Mirrors scans/IdentifyQueue.
 */
@Injectable()
export class ComparisonQueue implements OnModuleDestroy {
  private queue?: Queue;

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.ai, { connection: createRedisConnection() });
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
