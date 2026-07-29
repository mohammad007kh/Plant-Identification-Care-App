import IORedis, { type RedisOptions } from 'ioredis';

/** Names of the BullMQ queues used across the app (producers/consumers in feature tasks). */
export const QUEUE_NAMES = {
  ai: 'ai',
  reminders: 'reminders',
  purge: 'purge',
  reconcile: 'reconcile',
  // Dedicated queue for chat-reply jobs (T-110): the `ai` queue's only current
  // consumer (IdentifyWorker) does not dispatch by `job.name`, so sharing it
  // would let identify/chat jobs be picked up by the wrong worker and silently
  // mis-processed. A separate queue keeps ChatWorker's consumption isolated.
  chat: 'chat',
  monthlyReset: 'monthly-reset',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Shared Redis connection factory for BullMQ. `maxRetriesPerRequest: null` is
 * required by BullMQ workers. Connection is created lazily by callers so that
 * importing this module never forces a Redis connection (keeps unit tests free
 * of infra).
 */
export function createRedisConnection(): IORedis {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:16379', options);
}
