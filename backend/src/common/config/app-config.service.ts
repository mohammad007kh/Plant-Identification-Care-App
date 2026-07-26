import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  allowedPhotoFileTypesConfigSchema,
  creditCostsConfigSchema,
  notificationConfigSchema,
  type AllowedPhotoFileTypesConfig,
  type CreditCostsConfig,
  type NotificationConfig,
} from 'shared';
import { db } from '../../db/client';
import { appConfig } from '../../db/schema';

/** Natural keys of the operator-configurable `app_config` rows this service reads. */
const CONFIG_KEYS = {
  allowedPhotoFileTypes: 'allowed_photo_file_types',
  creditCosts: 'credit_costs',
  // Mirrors the literal key in admin/admin-config.repository.ts (kept local
  // there deliberately to avoid coupling the admin module to this service's
  // internals — see that file's comment).
  notification: 'notification_config',
} as const;

/**
 * Reads operator-configurable settings from the `app_config` table at request
 * time (no build-time hardcoding, no silent defaults) so an admin's change takes
 * effect on the next request without a deploy (FR-005 / FR-027, read side).
 *
 * A missing or schema-invalid row throws — an operator/seed gap must be loud,
 * not papered over. The thrown error surfaces as an RFC7807 500 via the global filter.
 */
@Injectable()
export class AppConfigService {
  async getAllowedPhotoFileTypes(): Promise<AllowedPhotoFileTypesConfig> {
    const value = await this.readConfigValue(CONFIG_KEYS.allowedPhotoFileTypes);
    return allowedPhotoFileTypesConfigSchema.parse(value);
  }

  async getCreditCosts(): Promise<CreditCostsConfig> {
    const value = await this.readConfigValue(CONFIG_KEYS.creditCosts);
    return creditCostsConfigSchema.parse(value);
  }

  /** Reminder templates + local send hour (FR-021), read live by the reminder worker (T-120). */
  async getNotificationConfig(): Promise<NotificationConfig> {
    const value = await this.readConfigValue(CONFIG_KEYS.notification);
    return notificationConfigSchema.parse(value);
  }

  private async readConfigValue(key: string): Promise<unknown> {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, key))
      .limit(1);

    if (rows.length === 0) {
      throw new Error(
        `app_config['${key}'] is missing — seed it (backend/src/db/seed.ts) or set it via the admin panel.`,
      );
    }

    return rows[0].value;
  }
}
