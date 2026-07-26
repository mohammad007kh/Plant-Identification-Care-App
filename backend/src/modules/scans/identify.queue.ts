import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../../jobs/queues';

export interface IdentifyJobData {
  /** Internal scan ULID (not the public UUID). */
  scanId: string;
  /** Reserved usage_record to settle; null for guest scans (no credit reserved). */
  usageRecordId: string | null;
}

/**
 * Producer for the async `identify` job on the shared `ai` queue. The Redis
 * connection is created lazily on first enqueue so importing this (or a unit
 * test that mocks it) never forces an infra connection.
 */
@Injectable()
export class IdentifyQueue implements OnModuleDestroy {
  private queue?: Queue;

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.ai, { connection: createRedisConnection() });
    }
    return this.queue;
  }

  async enqueueIdentify(data: IdentifyJobData): Promise<void> {
    await this.getQueue().add('identify', data, { removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
