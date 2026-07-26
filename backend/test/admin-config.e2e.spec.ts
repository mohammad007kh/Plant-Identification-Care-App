process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { appConfig, subscriptionTier, users } from '../src/db/schema';
import { AdminModule } from '../src/admin/admin.module';
import {
  ALLOWED_PHOTO_FILE_TYPES_KEY,
  CREDIT_COSTS_KEY,
  NOTIFICATION_CONFIG_KEY,
} from '../src/admin/admin-config.repository';
import { AppConfigService } from '../src/common/config/app-config.service';
import { UploadValidationService } from '../src/common/uploads/upload-validation.service';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
let uploadValidator: UploadValidationService;

const createdUserIds: string[] = [];
let originalFreeTier: {
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
} | null = null;

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(role: 'user' | 'admin'): Promise<{ id: string; publicId: string }> {
  const email = `admin-config-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', role })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  return u;
}

beforeAll(async () => {
  // Save the 'free' tier's original state (if it exists) so we can restore it —
  // subscription_tier is shared state other suites may rely on (Station 17 rule:
  // never delete/clobber shared rows you didn't create).
  const [existing] = await db
    .select({
      monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      priceMinor: subscriptionTier.priceMinor,
      currency: subscriptionTier.currency,
      active: subscriptionTier.active,
    })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'free'))
    .limit(1);
  originalFreeTier = existing ?? null;
  if (!existing) {
    await db
      .insert(subscriptionTier)
      .values({ key: 'free', monthlyCreditAllowance: 30, priceMinor: 0 });
  }

  const moduleRef = await Test.createTestingModule({ imports: [AdminModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  uploadValidator = new UploadValidationService(moduleRef.get(AppConfigService));
});

afterAll(async () => {
  await app?.close();
  if (originalFreeTier) {
    await db.update(subscriptionTier).set(originalFreeTier).where(eq(subscriptionTier.key, 'free'));
  } else {
    await db.delete(subscriptionTier).where(eq(subscriptionTier.key, 'free'));
  }
  // NOTE: shared app_config keys (allowed_photo_file_types, credit_costs) are
  // intentionally left as this suite sets them — other suites re-seed idempotently
  // before reading (see plants.e2e.spec.ts / scans.e2e.spec.ts precedent). The new
  // `notification_config` key is this task's own addition; harmless to leave set.
  // They carry `updated_by = <this suite's admin user>` though — null that out
  // first so deleting our test users doesn't violate the FK.
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
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('Admin operational config (T-140, US9, FR-005/FR-014/FR-021/FR-027)', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/admin/config').expect(401);
  });

  it('rejects a non-admin authenticated user (403)', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .get('/admin/config')
      .set('Authorization', bearer(member.publicId))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/admin/config')
      .set('Authorization', bearer(member.publicId))
      .send({ creditCosts: { identify: 1, chat: 1, comparison: 1 } })
      .expect(403);
  });

  it('admin PATCHes the full config, then GETs the same values back', async () => {
    const admin = await makeUser('admin');
    const body = {
      allowedPhotoFileTypes: ['image/png', 'image/webp'],
      creditCosts: { identify: 1, chat: 1, comparison: 2 },
      notification: {
        templates: {
          watering: { subject: 'Water time', bodyFa: 'وقت آبیاری' },
          custom: { subject: 'Reminder', bodyFa: 'یادآوری' },
        },
        sendHourLocalTehran: 9,
      },
    };

    const patched = await request(app.getHttpServer())
      .patch('/admin/config')
      .set('Authorization', bearer(admin.publicId))
      .send(body)
      .expect(200);
    expect(patched.body).toEqual(body);

    const got = await request(app.getHttpServer())
      .get('/admin/config')
      .set('Authorization', bearer(admin.publicId))
      .expect(200);
    expect(got.body).toEqual(body);
  });

  it('rejects an invalid config patch (400) — negative credit cost', async () => {
    const admin = await makeUser('admin');
    await request(app.getHttpServer())
      .patch('/admin/config')
      .set('Authorization', bearer(admin.publicId))
      .send({ creditCosts: { identify: -1, chat: 1, comparison: 1 } })
      .expect(400);
  });

  it('changing allowed_photo_file_types via the admin API changes upload validation for the SAME running process, with no restart', async () => {
    const admin = await makeUser('admin');
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 5, g: 100, b: 5 } },
    })
      .jpeg()
      .toBuffer();

    await request(app.getHttpServer())
      .patch('/admin/config')
      .set('Authorization', bearer(admin.publicId))
      .send({ allowedPhotoFileTypes: ['image/png'] })
      .expect(200);
    await expect(uploadValidator.validateAndNormalize(jpeg)).rejects.toThrow();

    await request(app.getHttpServer())
      .patch('/admin/config')
      .set('Authorization', bearer(admin.publicId))
      .send({ allowedPhotoFileTypes: ['image/jpeg'] })
      .expect(200);
    const result = await uploadValidator.validateAndNormalize(jpeg);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('GET /admin/tiers lists tiers; PATCH updates the monthly credit allowance live', async () => {
    const admin = await makeUser('admin');

    const list = await request(app.getHttpServer())
      .get('/admin/tiers')
      .set('Authorization', bearer(admin.publicId))
      .expect(200);
    expect(list.body.some((t: { key: string }) => t.key === 'free')).toBe(true);

    const patched = await request(app.getHttpServer())
      .patch('/admin/tiers')
      .set('Authorization', bearer(admin.publicId))
      .send({ key: 'free', monthlyCreditAllowance: 42 })
      .expect(200);
    expect(patched.body.key).toBe('free');
    expect(patched.body.monthlyCreditAllowance).toBe(42);

    const [row] = await db
      .select({ monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.key, 'free'))
      .limit(1);
    expect(row.monthlyCreditAllowance).toBe(42);
  });

  it('a non-admin cannot PATCH tiers (403)', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .patch('/admin/tiers')
      .set('Authorization', bearer(member.publicId))
      .send({ key: 'free', monthlyCreditAllowance: 1 })
      .expect(403);
  });
});
