import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminConfig, AdminTier, UpdateAdminConfigRequest, UpdateTierRequest } from 'shared';
import { AppConfigService } from '../common/config/app-config.service';
import {
  ALLOWED_PHOTO_FILE_TYPES_KEY,
  AdminConfigRepository,
  CREDIT_COSTS_KEY,
  NOTIFICATION_CONFIG_KEY,
} from './admin-config.repository';
import { TierRepository, type TierRow } from './tier.repository';

function toAdminTier(row: TierRow): AdminTier {
  return { ...row };
}

/**
 * Admin WRITE side for the live operational config the rest of the app reads
 * (US9, FR-005/FR-014/FR-021/FR-027):
 *  - `allowed_photo_file_types` / `credit_costs` — read by `AppConfigService`
 *    (T-013); this service reuses that SAME reader for GET so admin and
 *    consumer never see divergent parsing.
 *  - `notification_config` (templates + timing, FR-021) — new key, read by
 *    the future T-120 scheduler.
 *  - `subscription_tier` rows (FR-014) — per-tier monthly credit allowance.
 *
 * Every write round-trips through the SAME Zod schema the read side parses
 * with (validated in the controller before this service is ever called) and
 * upserts by natural key — the very next request anywhere sees the change,
 * no deploy required.
 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly adminConfigRepo: AdminConfigRepository,
    private readonly tiers: TierRepository,
  ) {}

  async getConfig(): Promise<AdminConfig> {
    const [allowedPhotoFileTypes, creditCosts, notification] = await Promise.all([
      this.appConfig.getAllowedPhotoFileTypes(),
      this.appConfig.getCreditCosts(),
      this.adminConfigRepo.getNotificationConfig(),
    ]);
    return { allowedPhotoFileTypes, creditCosts, notification };
  }

  async updateConfig(adminUserId: string, patch: UpdateAdminConfigRequest): Promise<AdminConfig> {
    const writes: Promise<void>[] = [];
    if (patch.allowedPhotoFileTypes) {
      writes.push(
        this.adminConfigRepo.upsert(
          ALLOWED_PHOTO_FILE_TYPES_KEY,
          patch.allowedPhotoFileTypes,
          adminUserId,
        ),
      );
    }
    if (patch.creditCosts) {
      writes.push(this.adminConfigRepo.upsert(CREDIT_COSTS_KEY, patch.creditCosts, adminUserId));
    }
    if (patch.notification) {
      writes.push(
        this.adminConfigRepo.upsert(NOTIFICATION_CONFIG_KEY, patch.notification, adminUserId),
      );
    }
    await Promise.all(writes);
    return this.getConfig();
  }

  async listTiers(): Promise<AdminTier[]> {
    const rows = await this.tiers.list();
    return rows.map(toAdminTier);
  }

  async updateTier(req: UpdateTierRequest): Promise<AdminTier> {
    const { key, ...patch } = req;
    const row = await this.tiers.updateByKey(key, patch);
    if (!row) throw new NotFoundException('tier.notFound');
    return toAdminTier(row);
  }
}
