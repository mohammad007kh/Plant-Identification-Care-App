import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { notificationConfigSchema, type NotificationConfig } from 'shared';
import { db } from '../db/client';
import { appConfig } from '../db/schema';

/**
 * Natural `app_config` keys this admin module reads/writes. Mirrors the
 * private `CONFIG_KEYS` in `common/config/app-config.service.ts` (T-013) for
 * the two keys that service already reads — kept as local literals here
 * (rather than importing that service's private constant) to avoid coupling
 * this admin module's internals to that one. `NOTIFICATION_CONFIG_KEY` is new
 * (FR-021); nothing else reads it yet (T-120 will).
 */
export const ALLOWED_PHOTO_FILE_TYPES_KEY = 'allowed_photo_file_types';
export const CREDIT_COSTS_KEY = 'credit_costs';
export const NOTIFICATION_CONFIG_KEY = 'notification_config';

/**
 * Admin WRITE access to `app_config` (repository pattern — no naked ORM
 * outside `*.repository.ts`). Every write upserts by the natural `key`
 * (the table's primary key, T-012) and records `updated_by` (the acting
 * admin's internal user id) for traceability (Station 17 audit rule). A write
 * here is immediately visible to every reader (e.g. `AppConfigService`) since
 * nothing caches `app_config` rows — no deploy required (FR-005/FR-027).
 */
@Injectable()
export class AdminConfigRepository {
  async upsert(key: string, value: unknown, updatedBy: string): Promise<void> {
    await db
      .insert(appConfig)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value, updatedBy, updatedAt: new Date() },
      });
  }

  /** Reads the notification templates/timing config. Throws if unset — no silent default. */
  async getNotificationConfig(): Promise<NotificationConfig> {
    const [row] = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, NOTIFICATION_CONFIG_KEY))
      .limit(1);

    if (!row) {
      throw new Error(
        `app_config['${NOTIFICATION_CONFIG_KEY}'] is missing — set it via the admin panel (PATCH /v1/admin/config).`,
      );
    }

    return notificationConfigSchema.parse(row.value);
  }
}
