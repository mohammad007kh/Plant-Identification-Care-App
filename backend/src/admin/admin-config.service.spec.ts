process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { NotificationConfig } from 'shared';
import { AppConfigService } from '../common/config/app-config.service';
import { db, pool } from '../db/client';
import { appConfig, users } from '../db/schema';
import {
  ALLOWED_PHOTO_FILE_TYPES_KEY,
  AdminConfigRepository,
  CREDIT_COSTS_KEY,
  NOTIFICATION_CONFIG_KEY,
} from './admin-config.repository';
import { ConfigService } from './config.service';
import { TierRepository } from './tier.repository';

// Live-DB test (Postgres on localhost:5433). Proves the WRITE side (ConfigService)
// and the EXISTING read side (AppConfigService, T-013) never diverge: a write here
// is visible to a brand-new AppConfigService instance immediately — no cache, no
// restart (FR-005/FR-027's core requirement).
//
// `allowed_photo_file_types`/`credit_costs` are SHARED app_config rows other e2e
// suites also set (see plants.e2e.spec.ts) — per that suite's own convention, they
// are seeded with a valid baseline here but intentionally never deleted at the
// end. `notification_config` is this task's own new key; also left set (harmless).

const baselineNotification: NotificationConfig = {
  templates: {
    watering: { subject: 'Water your plant', bodyFa: 'وقت آبیاری است' },
    custom: { subject: 'Reminder', bodyFa: 'یادآوری' },
  },
  sendHourLocalTehran: 8,
};

let adminUserId: string;
let service: ConfigService;
let repo: AdminConfigRepository;

/**
 * (Re-)establishes all three config keys as valid, immediately before each
 * test. `allowed_photo_file_types`/`credit_costs` are SHARED `app_config` rows
 * other suites also write concurrently (Vitest runs test FILES in parallel) —
 * re-seeding right before each test's own assertions (rather than once for the
 * whole suite) keeps the race window to milliseconds, matching the convention
 * `app-config.service.spec.ts` already uses (set-then-immediately-assert).
 */
async function ensureBaseline(): Promise<void> {
  await repo.upsert(
    ALLOWED_PHOTO_FILE_TYPES_KEY,
    ['image/jpeg', 'image/png', 'image/webp'],
    adminUserId,
  );
  await repo.upsert(CREDIT_COSTS_KEY, { identify: 1, chat: 1, comparison: 1 }, adminUserId);
  await repo.upsert(NOTIFICATION_CONFIG_KEY, baselineNotification, adminUserId);
}

beforeAll(async () => {
  const [row] = await db
    .insert(users)
    .values({
      email: `admin-config-spec-${Date.now()}@test.local`,
      passwordHash: 'x',
      role: 'admin',
    })
    .returning({ id: users.id });
  adminUserId = row.id;
  repo = new AdminConfigRepository();
  service = new ConfigService(new AppConfigService(), repo, new TierRepository());
});

beforeEach(async () => {
  await ensureBaseline();
});

afterAll(async () => {
  // The shared app_config rows are intentionally left behind (see note above),
  // but they carry `updated_by = adminUserId` — null that out first so deleting
  // this suite's admin user doesn't violate the FK.
  await db
    .update(appConfig)
    .set({ updatedBy: null })
    .where(
      inArray(appConfig.key, [
        ALLOWED_PHOTO_FILE_TYPES_KEY,
        CREDIT_COSTS_KEY,
        NOTIFICATION_CONFIG_KEY,
      ]),
    );
  await db.delete(users).where(eq(users.id, adminUserId));
  await pool.end();
});

describe('ConfigService (T-140 admin write side, FR-005/FR-021/FR-027)', () => {
  it('writes allowed_photo_file_types and a fresh AppConfigService reads it back immediately', async () => {
    await service.updateConfig(adminUserId, { allowedPhotoFileTypes: ['image/png'] });

    const reader = new AppConfigService();
    await expect(reader.getAllowedPhotoFileTypes()).resolves.toEqual(['image/png']);

    // Change it again — the next read (same or new reader instance) sees the NEW
    // value with no restart, proving there is no cache anywhere in the read path.
    await service.updateConfig(adminUserId, {
      allowedPhotoFileTypes: ['image/jpeg', 'image/webp'],
    });
    await expect(reader.getAllowedPhotoFileTypes()).resolves.toEqual(['image/jpeg', 'image/webp']);
  });

  it('writes credit_costs and AppConfigService reads it back', async () => {
    await service.updateConfig(adminUserId, {
      creditCosts: { identify: 2, chat: 3, comparison: 4 },
    });
    const reader = new AppConfigService();
    await expect(reader.getCreditCosts()).resolves.toEqual({ identify: 2, chat: 3, comparison: 4 });
  });

  it('records updated_by (the acting admin) on every app_config write, for audit', async () => {
    await service.updateConfig(adminUserId, {
      creditCosts: { identify: 1, chat: 1, comparison: 1 },
    });
    const [row] = await db
      .select({ updatedBy: appConfig.updatedBy })
      .from(appConfig)
      .where(eq(appConfig.key, CREDIT_COSTS_KEY))
      .limit(1);
    expect(row.updatedBy).toBe(adminUserId);
  });

  it('a value that is well-typed but semantically invalid (negative cost) is still rejected on read', async () => {
    // TypeScript's `UpdateAdminConfigRequest` type does not encode "nonnegative" —
    // that constraint is Zod-only. The controller runs `safeParse` (400) BEFORE
    // calling this service, so this proves the defense-in-depth: even if a bad
    // value ever reached storage, the read side (which re-parses on every read,
    // T-013) refuses to serve it rather than silently trusting stored data.
    await repo.upsert(CREDIT_COSTS_KEY, { identify: -1, chat: 1, comparison: 1 }, adminUserId);
    const reader = new AppConfigService();
    await expect(reader.getCreditCosts()).rejects.toThrow();
  });

  it('getConfig() returns all three config blobs together, and PATCH+GET round-trips notification config', async () => {
    await service.updateConfig(adminUserId, {
      allowedPhotoFileTypes: ['image/png'],
      creditCosts: { identify: 1, chat: 1, comparison: 1 },
      notification: baselineNotification,
    });

    const cfg = await service.getConfig();
    expect(cfg.allowedPhotoFileTypes).toEqual(['image/png']);
    expect(cfg.creditCosts).toEqual({ identify: 1, chat: 1, comparison: 1 });
    expect(cfg.notification).toEqual(baselineNotification);
  });
});
