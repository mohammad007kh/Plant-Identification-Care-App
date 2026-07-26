import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';

export interface PurgeJobData {
  /** Internal user ULID (not the public UUID). */
  userId: string;
}

/**
 * Producer for the delayed `purge` job on the `purge` queue (T-130). The Redis
 * connection is created lazily on first enqueue so importing this (or a unit
 * test that mocks it) never forces an infra connection. Mirrors `IdentifyQueue`
 * (T-020).
 */
@Injectable()
export class DeletionQueue implements OnModuleDestroy {
  private queue?: Queue;

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.purge, { connection: createRedisConnection() });
    }
    return this.queue;
  }

  /**
   * Schedules the delayed purge for `userId`, exactly `delayMs` out. Uses a
   * deterministic `jobId` (`purge:<userId>`) so at most one purge job per user
   * is ever pending — a repeat request while already pending safely re-adds
   * under the same id instead of stacking duplicate purges.
   */
  async schedulePurge(userId: string, delayMs: number): Promise<void> {
    const data: PurgeJobData = { userId };
    await this.getQueue().add('purge', data, {
      jobId: this.jobIdFor(userId),
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  /** Removes a previously scheduled purge job (cancel). No-op if absent/already run. */
  async unschedulePurge(userId: string): Promise<void> {
    const job = await this.getQueue().getJob(this.jobIdFor(userId));
    await job?.remove();
  }

  private jobIdFor(userId: string): string {
    return `purge:${userId}`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
