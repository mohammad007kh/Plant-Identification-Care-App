import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';

export interface ChatJobData {
  conversationId: string;
  /** Reserved usage_record to settle; null for a Free-tier message under the cap. */
  usageRecordId: string | null;
  content: string;
  /** Storage keys of the ≤2 context photos, resolved at send-time (tenancy already checked). */
  storageKeys: string[];
}

/**
 * Producer for the async chat-reply job on the dedicated `chat` queue (kept
 * separate from `ai` — see jobs/queues.ts — so ChatWorker never competes with
 * IdentifyWorker for the other's jobs). Injected (rather than constructed
 * inline in ChatService) so unit tests can substitute a mock, mirroring
 * scans/IdentifyQueue and plants/ComparisonQueue. The Redis connection is
 * created lazily on first enqueue so importing this never forces an infra
 * connection.
 */
@Injectable()
export class ChatQueue implements OnModuleDestroy {
  private queue?: Queue;

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.chat, { connection: createRedisConnection() });
    }
    return this.queue;
  }

  async enqueueChat(data: ChatJobData): Promise<void> {
    await this.getQueue().add('chat', data, { removeOnComplete: true, removeOnFail: 100 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
