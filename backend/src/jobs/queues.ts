import IORedis, { type RedisOptions } from 'ioredis';

/** Names of the BullMQ queues used across the app (producers/consumers in feature tasks). */
export const QUEUE_NAMES = {
  // `ai` carries ONLY identify jobs. IdentifyWorker does not dispatch by
  // job.name (processes every job it pops), so no other job type may share this
  // queue — a second worker on the same queue pops (and, on a no-op return,
  // completes+removes) jobs meant for the other, silently dropping them. Each
  // other AI-backed job type therefore gets its own dedicated queue below.
  ai: 'ai',
  // `reminders` carries ONLY the repeatable `sweep` job (ReminderScheduler is
  // its sole consumer). Per-plant `send` jobs go on the dedicated
  // `reminder-send` queue below — same isolation rule as `ai`: two workers on
  // one queue (a `sweep` filter + a `send` filter) silently drop each other's
  // jobs on a no-op return.
  reminders: 'reminders',
  reminderSend: 'reminder-send',
  purge: 'purge',
  reconcile: 'reconcile',
  // Dedicated queue for chat-reply jobs (T-110) — isolated from `ai` for the
  // reason above (a shared queue silently mis-routes/drops jobs).
  chat: 'chat',
  // Dedicated queue for follow-up health-comparison jobs (T-100/T-107). MUST be
  // separate from `ai`: ComparisonWorker filters `job.name === 'comparison'`, so
  // sharing `ai` made it pop identify jobs and drop them (no-op → completed →
  // removeOnComplete), stalling ~half of all identifications.
  comparison: 'comparison',
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
