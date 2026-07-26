import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';
import { NotificationRepository } from './notification.repository';

export interface DueReminder {
  userId: string;
  plantId: string;
  type: 'watering';
  /** UTC instant this occurrence is due. */
  scheduledFor: Date;
}

const DEFAULT_WATERING_INTERVAL_DAYS = 7;
const SWEEP_EVERY_MS = Number(process.env.REMINDER_SWEEP_EVERY_MS ?? 15 * 60 * 1000);

/** Reads `wateringIntervalDays` off the species' free-form care guide, defaulting when absent/invalid. */
function wateringIntervalDays(careGuide: unknown): number {
  if (careGuide && typeof careGuide === 'object' && !Array.isArray(careGuide)) {
    const raw = (careGuide as Record<string, unknown>).wateringIntervalDays;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  }
  return DEFAULT_WATERING_INTERVAL_DAYS;
}

/**
 * Derives each plant's watering schedule from its species' care guide and
 * enqueues delayed `send` jobs onto the `reminders` queue for `ReminderWorker`
 * to process (US7, FR-020). `computeDueReminders`/`enqueueDueReminders` are
 * business logic kept separate from the repeatable-sweep BullMQ wiring
 * (mirrors `ReconciliationService`/`ReconciliationWorker`, T-11x) so they're
 * directly unit-testable without a live queue.
 *
 * Times are computed and stored in UTC internally (registry `domain.timezone`);
 * only presentation (T-121) renders against Asia/Tehran.
 */
@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly repo: NotificationRepository) {}

  /** Pure computation (no writes): which plants are due for a watering reminder as of `now`. */
  async computeDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
    const candidates = await this.repo.listSchedulableWaterings();
    const due: DueReminder[] = [];

    for (const candidate of candidates) {
      const last = await this.repo.findLastWateringScheduledFor(candidate.plantId);
      const intervalMs = wateringIntervalDays(candidate.careGuide) * 24 * 60 * 60 * 1000;
      const baseline = last ?? candidate.plantCreatedAt;
      const nextDue = new Date(baseline.getTime() + intervalMs);

      if (nextDue.getTime() <= now.getTime()) {
        due.push({
          userId: candidate.userId,
          plantId: candidate.plantId,
          type: 'watering',
          scheduledFor: nextDue,
        });
      }
    }

    return due;
  }

  /**
   * Enqueues one delayed `send` job per due plant. A deterministic `jobId`
   * (`reminder:<plantId>:<type>:<scheduledForISO>`) means re-running the sweep
   * before a job has fired is a safe no-op — BullMQ rejects the duplicate id —
   * which is the enqueue-side half of this feature's idempotency guarantee
   * (the worker-side half is `NotificationRepository.upsertNotification`).
   */
  async enqueueDueReminders(now: Date = new Date()): Promise<number> {
    const due = await this.computeDueReminders(now);

    for (const reminder of due) {
      const scheduledForIso = reminder.scheduledFor.toISOString();
      await this.getQueue().add(
        'send',
        {
          userId: reminder.userId,
          plantId: reminder.plantId,
          type: reminder.type,
          scheduledFor: scheduledForIso,
        },
        {
          jobId: `reminder:${reminder.plantId}:${reminder.type}:${scheduledForIso}`,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }

    return due.length;
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAMES.reminders, { connection: createRedisConnection() });
    }
    return this.queue;
  }

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;

    this.getQueue()
      .add(
        'sweep',
        {},
        { repeat: { every: SWEEP_EVERY_MS }, removeOnComplete: true, removeOnFail: 100 },
      )
      .catch((err) =>
        this.logger.error(`failed to register reminder sweep: ${(err as Error).message}`),
      );

    // Shares the `reminders` queue with `ReminderWorker`'s `send` consumer
    // (filtering by job.name below); multiple named jobs coexisting on one
    // queue mirrors the identify/comparison split on the `ai` queue (T-020/
    // T-060) — full multi-worker registration is T-127's job, same as T-107
    // is for that queue.
    this.worker = new Worker(
      QUEUE_NAMES.reminders,
      async (job) => {
        if (job.name !== 'sweep') return;
        const count = await this.enqueueDueReminders();
        if (count > 0) this.logger.log(`Reminder sweep enqueued ${count} due reminder(s).`);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`reminder sweep failed: ${err?.message}`),
    );
    this.logger.log(`Reminder scheduler started (sweep every ${SWEEP_EVERY_MS}ms).`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
