import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { appConfig } from '../../db/schema';
import { AppConfigService } from './app-config.service';

// Live-DB test (Postgres on localhost:25432 via the client default). Verifies the
// read path against the real app_config table; idempotent via per-key cleanup.

const service = new AppConfigService();
const ALLOWED_KEY = 'allowed_photo_file_types';
const COSTS_KEY = 'credit_costs';

async function setConfig(key: string, value: unknown): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
}

async function delConfig(key: string): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.key, key));
}

afterEach(async () => {
  await delConfig(ALLOWED_KEY);
  await delConfig(COSTS_KEY);
});

afterAll(async () => {
  await pool.end();
});

describe('AppConfigService (T-013, FR-005)', () => {
  it('reads allowed photo file types live from app_config', async () => {
    await setConfig(ALLOWED_KEY, ['image/jpeg', 'image/png', 'image/webp']);
    await expect(service.getAllowedPhotoFileTypes()).resolves.toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('reflects an updated config value without any restart (no cache)', async () => {
    await setConfig(ALLOWED_KEY, ['image/jpeg']);
    await expect(service.getAllowedPhotoFileTypes()).resolves.toEqual(['image/jpeg']);
    await setConfig(ALLOWED_KEY, ['image/png', 'image/webp']);
    await expect(service.getAllowedPhotoFileTypes()).resolves.toEqual(['image/png', 'image/webp']);
  });

  it('throws when the config row is missing (no silent default)', async () => {
    await delConfig(ALLOWED_KEY);
    await expect(service.getAllowedPhotoFileTypes()).rejects.toThrow(/missing/);
  });

  it('throws when the stored value fails its schema', async () => {
    await setConfig(ALLOWED_KEY, { not: 'an array' });
    await expect(service.getAllowedPhotoFileTypes()).rejects.toThrow();
  });

  it('reads per-action credit costs live', async () => {
    await setConfig(COSTS_KEY, { identify: 1, chat: 1, comparison: 1 });
    await expect(service.getCreditCosts()).resolves.toEqual({
      identify: 1,
      chat: 1,
      comparison: 1,
    });
  });
});
