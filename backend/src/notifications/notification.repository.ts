import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { notification, plant, species, users } from '../db/schema';

export type ReminderType = 'watering' | 'custom';
export type ReminderChannel = 'email' | 'push';
export type NotificationDeliveryStatus = 'scheduled' | 'sent' | 'skipped' | 'failed';

export interface SchedulableWatering {
  plantId: string;
  userId: string;
  plantCreatedAt: Date;
  /** Free-form species care guide (T-010 `species.care_guide`); may contain `wateringIntervalDays`. */
  careGuide: unknown;
}

export interface ReminderUserRow {
  id: string;
  email: string;
  notifEmailEnabled: boolean;
  notifPushEnabled: boolean;
}

export interface ReminderPlantRow {
  id: string;
  nickname: string | null;
  speciesScientificName: string | null;
  speciesCommonNameFa: string | null;
}

export interface ExistingNotificationRow {
  id: string;
  status: NotificationDeliveryStatus;
}

export interface UpsertNotificationParams {
  userId: string;
  plantId: string;
  type: ReminderType;
  channel: ReminderChannel;
  scheduledFor: Date;
  status: NotificationDeliveryStatus;
  sentAt?: Date | null;
}

/**
 * All Drizzle access for `notification` plus the `plant`/`species`/`users`
 * reads the reminder scheduler/worker need (repository pattern — no naked ORM
 * in the scheduler/service/worker, per `code_patterns.data_access`). Reads
 * that resolve a specific plant are scoped by `userId` (Station 07 tenancy
 * rule); `listSchedulableWaterings` is the one deliberate exception — the
 * periodic sweep must see every active user's plants to compute what's due.
 */
@Injectable()
export class NotificationRepository {
  /** Every plant with a species (care guide) whose owning account is active (not purged/deleting). */
  async listSchedulableWaterings(): Promise<SchedulableWatering[]> {
    return db
      .select({
        plantId: plant.id,
        userId: plant.userId,
        plantCreatedAt: plant.createdAt,
        careGuide: species.careGuide,
      })
      .from(plant)
      .innerJoin(species, eq(species.id, plant.speciesId))
      .innerJoin(users, eq(users.id, plant.userId))
      .where(and(isNotNull(plant.speciesId), eq(users.deletionStatus, 'active')));
  }

  /** Most recent `scheduled_for` across any channel for this plant's watering reminders, if any. */
  async findLastWateringScheduledFor(plantId: string): Promise<Date | null> {
    const [row] = await db
      .select({ scheduledFor: notification.scheduledFor })
      .from(notification)
      .where(and(eq(notification.plantId, plantId), eq(notification.type, 'watering')))
      .orderBy(desc(notification.scheduledFor))
      .limit(1);
    return row?.scheduledFor ?? null;
  }

  async findUserForReminder(userId: string): Promise<ReminderUserRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        notifEmailEnabled: users.notifEmailEnabled,
        notifPushEnabled: users.notifPushEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  /** Tenancy-scoped: only resolves a plant that `userId` actually owns (never by plant id alone). */
  async findPlantForReminder(userId: string, plantId: string): Promise<ReminderPlantRow | null> {
    const [row] = await db
      .select({
        id: plant.id,
        nickname: plant.nickname,
        speciesScientificName: species.scientificName,
        speciesCommonNameFa: species.commonNameFa,
      })
      .from(plant)
      .leftJoin(species, eq(species.id, plant.speciesId))
      .where(and(eq(plant.id, plantId), eq(plant.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async findExisting(
    userId: string,
    plantId: string,
    type: ReminderType,
    channel: ReminderChannel,
    scheduledFor: Date,
  ): Promise<ExistingNotificationRow | null> {
    const [row] = await db
      .select({ id: notification.id, status: notification.status })
      .from(notification)
      .where(
        and(
          eq(notification.userId, userId),
          eq(notification.plantId, plantId),
          eq(notification.type, type),
          eq(notification.channel, channel),
          eq(notification.scheduledFor, scheduledFor),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Writes the outcome of one channel's send attempt. Upserts by the natural
   * (user, plant, type, channel, scheduledFor) key: a re-delivered BullMQ job
   * for the SAME due window always resolves to the same existing row (never
   * inserting a second one) — this is what makes a retried job idempotent at
   * the storage layer, on top of the caller's own already-sent guard.
   */
  async upsertNotification(params: UpsertNotificationParams): Promise<void> {
    const { userId, plantId, type, channel, scheduledFor, status, sentAt } = params;
    const existing = await this.findExisting(userId, plantId, type, channel, scheduledFor);

    if (existing) {
      await db
        .update(notification)
        .set({ status, sentAt: sentAt ?? null })
        .where(eq(notification.id, existing.id));
      return;
    }

    await db.insert(notification).values({
      userId,
      plantId,
      type,
      channel,
      scheduledFor,
      status,
      sentAt: sentAt ?? null,
    });
  }
}
