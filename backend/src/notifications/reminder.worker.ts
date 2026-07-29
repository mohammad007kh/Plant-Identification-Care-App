import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '../jobs/queues';
import { AppConfigService } from '../common/config/app-config.service';
import { MAIL_PORT, type MailPort } from './mail.port';
import {
  NotificationRepository,
  type ReminderChannel,
  type ReminderType,
} from './notification.repository';
import { PushService } from './push.service';

export interface ReminderJobData {
  /** Internal user ULID (not the public UUID). */
  userId: string;
  /** Internal plant ULID (not the public UUID). */
  plantId: string;
  type: ReminderType;
  /** UTC ISO timestamp — the due window this occurrence represents (part of the idempotency key). */
  scheduledFor: string;
}

/** Replaces `{{key}}` placeholders in an admin-configured template string. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/**
 * Business logic of the reminder send (US7, FR-020/FR-021/FR-022) — kept
 * separate from the BullMQ `Worker` wiring so `processReminder` is directly
 * unit-testable without a live queue (mirrors ComparisonService/
 * ComparisonWorker, T-060). Email (`MailPort`) is the guaranteed primary
 * channel: it is always attempted and fully resolved (recorded
 * sent/skipped/failed) BEFORE push is ever touched, so a push failure can
 * never block, undo, or fail the email outcome already recorded.
 */
@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private worker?: Worker;

  constructor(
    private readonly repo: NotificationRepository,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
    private readonly push: PushService,
    private readonly config: AppConfigService,
  ) {}

  async processReminder(data: ReminderJobData): Promise<void> {
    const scheduledFor = new Date(data.scheduledFor);

    const user = await this.repo.findUserForReminder(data.userId);
    if (!user) return; // account gone (e.g. purged) since scheduling — nothing to send

    const plant = await this.repo.findPlantForReminder(data.userId, data.plantId);
    if (!plant) return; // plant removed since scheduling — nothing to send

    const notificationConfig = await this.config.getNotificationConfig();
    const template = notificationConfig.templates[data.type];
    const vars = {
      plantName:
        plant.nickname ?? plant.speciesCommonNameFa ?? plant.speciesScientificName ?? 'گیاه شما',
    };
    const subject = renderTemplate(template.subject, vars);
    const body = renderTemplate(template.bodyFa, vars);

    // Email: guaranteed primary channel, always attempted first and fully
    // resolved before push is ever touched.
    await this.sendChannel({
      userId: data.userId,
      plantId: data.plantId,
      type: data.type,
      scheduledFor,
      channel: 'email',
      enabled: user.notifEmailEnabled,
      attempt: async () => {
        await this.mail.send({ to: user.email, subject, html: body });
        return 'sent' as const;
      },
    });

    // Push: best-effort/secondary. `sendChannel`'s own try/catch records a
    // thrown push error as `failed` and never lets it propagate — it cannot
    // retroactively touch the email outcome already recorded above.
    await this.sendChannel({
      userId: data.userId,
      plantId: data.plantId,
      type: data.type,
      scheduledFor,
      channel: 'push',
      enabled: user.notifPushEnabled,
      attempt: async () => {
        const delivered = await this.push.sendBestEffort(data.userId, { title: subject, body });
        return delivered ? ('sent' as const) : ('skipped' as const);
      },
    });
  }

  /**
   * Sends (or skips) one channel and records the outcome. Idempotent: a
   * channel already marked `sent` for this exact (user, plant, type,
   * scheduledFor) key is never re-attempted — this is what makes a
   * re-delivered BullMQ job (at-least-once) a safe no-op.
   */
  private async sendChannel(params: {
    userId: string;
    plantId: string;
    type: ReminderType;
    scheduledFor: Date;
    channel: ReminderChannel;
    enabled: boolean;
    attempt: () => Promise<'sent' | 'skipped'>;
  }): Promise<void> {
    const { userId, plantId, type, scheduledFor, channel, enabled, attempt } = params;

    const existing = await this.repo.findExisting(userId, plantId, type, channel, scheduledFor);
    if (existing?.status === 'sent') return;

    if (!enabled) {
      await this.repo.upsertNotification({
        userId,
        plantId,
        type,
        channel,
        scheduledFor,
        status: 'skipped',
      });
      return;
    }

    try {
      const result = await attempt();
      await this.repo.upsertNotification({
        userId,
        plantId,
        type,
        channel,
        scheduledFor,
        status: result,
        sentAt: result === 'sent' ? new Date() : null,
      });
    } catch (err) {
      this.logger.warn(
        `${channel} reminder send failed (user ${userId}, plant ${plantId}): ${(err as Error).message}`,
      );
      await this.repo.upsertNotification({
        userId,
        plantId,
        type,
        channel,
        scheduledFor,
        status: 'failed',
      });
    }
  }

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === '1') return;
    // Sole consumer of the dedicated `reminder-send` queue (ReminderScheduler
    // enqueues `send` jobs there). Kept off the `reminders` (sweep) queue so the
    // two workers never pop — and silently drop — each other's jobs.
    this.worker = new Worker(
      QUEUE_NAMES.reminderSend,
      async (job) => {
        if (job.name !== 'send') return;
        await this.processReminder(job.data as ReminderJobData);
      },
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (_job, err) =>
      this.logger.error(`reminder job failed: ${err?.message}`),
    );
    this.logger.log('Reminder worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
