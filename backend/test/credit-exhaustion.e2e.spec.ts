process.env.DISABLE_WORKERS = '1';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:15432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:16379';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import {
  appConfig,
  creditTransaction,
  photo,
  plant,
  scan,
  species,
  subscriptionTier,
  users,
} from '../src/db/schema';
import { PlantsModule } from '../src/modules/plants/plants.module';
import { ComparisonQueue } from '../src/modules/plants/comparison.queue';
import { StorageService } from '../src/common/uploads/storage.service';
import { CreditsService } from '../src/credits/credits.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem.filter';

const SECRET = process.env.JWT_ACCESS_SECRET as string;
const COMPARISON_COST = 3;

let app: INestApplication;
let credits: CreditsService;
let seededSpeciesId: string;
let pngBuffer: Buffer;

interface FreeTierSnapshot {
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}
let originalFreeTier: FreeTierSnapshot | null = null;

const createdUserIds: string[] = [];
const createdScanIds: string[] = [];
const createdPlantIds: string[] = [];
const publicIdByUser = new Map<string, string>();

function bearer(userId: string): string {
  const publicId = publicIdByUser.get(userId) ?? userId;
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(): Promise<string> {
  const email = `credit-guard-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  publicIdByUser.set(u.id, u.publicId);
  return u.id;
}

async function seedScan(userId: string): Promise<{ publicId: string }> {
  const [scanRow] = await db
    .insert(scan)
    .values({
      userId,
      type: 'identify',
      status: 'completed',
      speciesId: seededSpeciesId,
      confidence: '0.900',
    })
    .returning({ id: scan.id, publicId: scan.publicId });
  createdScanIds.push(scanRow.id);

  const [photoRow] = await db
    .insert(photo)
    .values({
      scanId: scanRow.id,
      storageKey: 'seed-key',
      contentType: 'image/png',
      bytes: 100,
      width: 8,
      height: 8,
    })
    .returning({ id: photo.id });
  await db.update(scan).set({ photoId: photoRow.id }).where(eq(scan.id, scanRow.id));

  return { publicId: scanRow.publicId };
}

async function internalPlantId(publicId: string): Promise<string> {
  const [row] = await db
    .select({ id: plant.id })
    .from(plant)
    .where(eq(plant.publicId, publicId))
    .limit(1);
  return row.id;
}

beforeAll(async () => {
  pngBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 30, g: 150, b: 70 } },
  })
    .png()
    .toBuffer();

  await db
    .insert(appConfig)
    .values({ key: 'allowed_photo_file_types', value: ['image/png', 'image/jpeg'] })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: ['image/png', 'image/jpeg'] } });
  await db
    .insert(appConfig)
    .values({ key: 'credit_costs', value: { identify: 1, chat: 1, comparison: COMPARISON_COST } })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: { identify: 1, chat: 1, comparison: COMPARISON_COST } },
    });

  // The 402 payload embeds the live plans list — make sure at least one active
  // tier exists (shared row; save/restore, never clobber — Station 17 rule).
  const [existingFree] = await db
    .select({
      monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      priceMinor: subscriptionTier.priceMinor,
      currency: subscriptionTier.currency,
      active: subscriptionTier.active,
    })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'free'))
    .limit(1);
  originalFreeTier = existingFree ?? null;
  if (!existingFree) {
    await db
      .insert(subscriptionTier)
      .values({ key: 'free', monthlyCreditAllowance: 30, priceMinor: 0, active: true });
  } else if (!existingFree.active) {
    await db.update(subscriptionTier).set({ active: true }).where(eq(subscriptionTier.key, 'free'));
  }

  const [sp] = await db
    .insert(species)
    .values({ scientificName: 'Ficus lyrata', commonNameFa: 'فیکوس لیراتا' })
    .returning({ id: species.id });
  seededSpeciesId = sp.id;

  const moduleRef = await Test.createTestingModule({ imports: [PlantsModule] })
    .overrideProvider(ComparisonQueue)
    .useValue({ enqueueComparison: async () => {}, onModuleDestroy: async () => {} })
    .overrideProvider(StorageService)
    .useValue({ put: async () => 'test-key', getBytes: async () => Buffer.from('img') })
    .compile();

  app = moduleRef.createNestApplication();
  // Registered explicitly here (not part of PlantsModule) so the 402's
  // application/problem+json shape + plans extension are actually exercised —
  // production wiring registers this filter globally via APP_FILTER (T-097).
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  credits = app.get(CreditsService);
});

afterAll(async () => {
  await app?.close();
  for (const plantId of createdPlantIds) {
    await db.delete(photo).where(eq(photo.plantId, plantId));
    await db.delete(scan).where(eq(scan.plantId, plantId));
    await db.delete(plant).where(eq(plant.id, plantId));
  }
  for (const scanId of createdScanIds) {
    await db.delete(photo).where(eq(photo.scanId, scanId));
    await db.delete(scan).where(eq(scan.id, scanId));
  }
  for (const id of createdUserIds) {
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(species).where(eq(species.id, seededSpeciesId));
  if (originalFreeTier) {
    await db.update(subscriptionTier).set(originalFreeTier).where(eq(subscriptionTier.key, 'free'));
  } else {
    await db.delete(subscriptionTier).where(eq(subscriptionTier.key, 'free'));
  }
  await pool.end();
});

describe('CreditCheckGuard on POST /plants/:id/photos (T-082, FR-016/FR-019)', () => {
  it('blocks the action with 402 application/problem+json + a non-empty live plans payload when balance is insufficient, performing no action', async () => {
    const userId = await makeUser(); // 0 balance
    const { publicId: scanPublicId } = await seedScan(userId);
    const created = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(created.body.id));

    const res = await request(app.getHttpServer())
      .post(`/plants/${created.body.id}/photos`)
      .set('Authorization', bearer(userId))
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(402);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBeGreaterThan(0);
    expect(res.body.plans.some((p: { key: string }) => p.key === 'free')).toBe(true);

    // No partial execution: the follow-up photo/comparison scan was never created.
    const one = await request(app.getHttpServer())
      .get(`/plants/${created.body.id}`)
      .set('Authorization', bearer(userId))
      .expect(200);
    expect(one.body.photos).toHaveLength(1);
  });

  it('allows the action through when the balance covers the cost', async () => {
    const userId = await makeUser();
    await credits.grant(userId, COMPARISON_COST, { idempotencyKey: `grant:${userId}` });
    const { publicId: scanPublicId } = await seedScan(userId);
    const created = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(created.body.id));

    await request(app.getHttpServer())
      .post(`/plants/${created.body.id}/photos`)
      .set('Authorization', bearer(userId))
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);

    const one = await request(app.getHttpServer())
      .get(`/plants/${created.body.id}`)
      .set('Authorization', bearer(userId))
      .expect(200);
    expect(one.body.photos).toHaveLength(2); // the follow-up was persisted
  });

  it('blocks with 402 exactly at balance == cost - 1, and allows exactly at balance == cost', async () => {
    const shortUserId = await makeUser();
    await credits.grant(shortUserId, COMPARISON_COST - 1, {
      idempotencyKey: `grant:${shortUserId}`,
    });
    const { publicId: shortScanPublicId } = await seedScan(shortUserId);
    const shortPlant = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(shortUserId))
      .send({ scanPublicId: shortScanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(shortPlant.body.id));

    await request(app.getHttpServer())
      .post(`/plants/${shortPlant.body.id}/photos`)
      .set('Authorization', bearer(shortUserId))
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(402);

    const exactUserId = await makeUser();
    await credits.grant(exactUserId, COMPARISON_COST, { idempotencyKey: `grant:${exactUserId}` });
    const { publicId: exactScanPublicId } = await seedScan(exactUserId);
    const exactPlant = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(exactUserId))
      .send({ scanPublicId: exactScanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(exactPlant.body.id));

    await request(app.getHttpServer())
      .post(`/plants/${exactPlant.body.id}/photos`)
      .set('Authorization', bearer(exactUserId))
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
  });
});
