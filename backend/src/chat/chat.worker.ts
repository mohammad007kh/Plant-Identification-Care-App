import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';
import type { ChatJobData } from './chat.queue';
import { ChatService } from './chat.service';

/**
 * BullMQ worker that drains chat-reply jobs off the dedicated `chat` queue and
 * hands each to ChatService.processJob. Connects to Redis at module init
 * (runtime only); tests set `DISABLE_WORKERS=1` and invoke
 * ChatService.processJob directly (mirrors scans/IdentifyWorker).
 */
@Injectable()
export class ChatWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatWorker.name);
  private worker?: Worker;

  constructor(private readonly chat: ChatService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    this.worker = new Worker(
      QUEUE_NAMES.chat,
      async (job) => {
        await this.chat.processJob(job.data as ChatJobData);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) => this.logger.error(`chat job failed: ${err?.message}`));
    this.logger.log('Chat worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
