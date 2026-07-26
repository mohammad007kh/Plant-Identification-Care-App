process.env.DISABLE_WORKERS = '1';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
// AppConfigModule (pulled in transitively via UploadsModule) validates these at
// bootstrap; the raw db client has a fallback but the validator does not.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { appConfig, photo, plant, scan, species, users } from '../src/db/schema';
import { PlantsModule } from '../src/modules/plants/plants.module';
import { ComparisonQueue } from '../src/modules/plants/comparison.queue';
import { StorageService } from '../src/common/uploads/storage.service';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
let seededSpeciesId: string;
let pngBuffer: Buffer;

const createdUserIds: string[] = [];
const createdScanIds: string[] = [];
const createdPlantIds: string[] = [];
const publicIdByUser = new Map<string, string>();

function bearer(userId: string): string {
  const publicId = publicIdByUser.get(userId) ?? userId;
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(): Promise<string> {
  const email = `plants-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  publicIdByUser.set(u.id, u.publicId);
  return u.id;
}

interface SeedScanParams {
  userId: string;
  status: 'pending' | 'completed' | 'failed';
  speciesId: string | null;
}

/** Seeds a scan + its initial photo row, mirroring what ScansRepository.createIdentifyScan persists. */
async function seedScan(params: SeedScanParams): Promise<{ scanId: string; publicId: string }> {
  const [scanRow] = await db
    .insert(scan)
    .values({
      userId: params.userId,
      type: 'identify',
      status: params.status,
      speciesId: params.speciesId,
      confidence: params.speciesId ? '0.900' : null,
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

  return { scanId: scanRow.id, publicId: scanRow.publicId };
}

beforeAll(async () => {
  pngBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 140, b: 60 } },
  })
    .png()
    .toBuffer();

  await db
    .insert(appConfig)
    .values({ key: 'allowed_photo_file_types', value: ['image/png', 'image/jpeg'] })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: ['image/png', 'image/jpeg'] } });

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
  await app.init();
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
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(species).where(eq(species.id, seededSpeciesId));
  // NOTE: shared app_config keys are intentionally NOT deleted (seeded idempotently
  // by several e2e suites that may run in parallel — see scans.e2e.spec.ts).
  await pool.end();
});

describe('Plants CRUD (T-060, US3, FR-009/FR-010)', () => {
  it('POST /plants: saves a plant from a completed, successful scan owned by the caller', async () => {
    const userId = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId,
      status: 'completed',
      speciesId: seededSpeciesId,
    });

    const res = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId, nickname: 'My Fig' })
      .expect(201);

    expect(res.body.nickname).toBe('My Fig');
    expect(res.body.species).not.toBeNull();
    expect(res.body.species.scientificName).toBe('Ficus lyrata');
    expect(res.body.photos).toHaveLength(1); // the scan's initial photo re-parented onto the plant
    createdPlantIds.push(await internalPlantId(res.body.id));
  });

  it('POST /plants: rejects (400) a scan that is still pending', async () => {
    const userId = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId,
      status: 'pending',
      speciesId: null,
    });

    await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(400);
  });

  it('POST /plants: rejects (400) a scan that completed without a species (low-confidence)', async () => {
    const userId = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId,
      status: 'completed',
      speciesId: null,
    });

    await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(400);
  });

  it('POST /plants: rejects (400) a scan belonging to a different user (never a naked lookup)', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId: owner,
      status: 'completed',
      speciesId: seededSpeciesId,
    });

    await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(other))
      .send({ scanPublicId })
      .expect(400);
  });

  it("GET /plants + GET /plants/:id: lists and fetches the caller's own saved plant", async () => {
    const userId = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId,
      status: 'completed',
      speciesId: seededSpeciesId,
    });
    const created = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(created.body.id));

    const list = await request(app.getHttpServer())
      .get('/plants')
      .set('Authorization', bearer(userId))
      .expect(200);
    expect(list.body.data.some((p: { id: string }) => p.id === created.body.id)).toBe(true);
    expect(list.body.nextCursor === null || typeof list.body.nextCursor === 'string').toBe(true);

    const one = await request(app.getHttpServer())
      .get(`/plants/${created.body.id}`)
      .set('Authorization', bearer(userId))
      .expect(200);
    expect(one.body.id).toBe(created.body.id);
    expect(one.body.photos).toHaveLength(1);
  });

  it("POST /plants/:id/photos: adds to the SAME plant's history via a pending comparison scan", async () => {
    const userId = await makeUser();
    const { publicId: scanPublicId } = await seedScan({
      userId,
      status: 'completed',
      speciesId: seededSpeciesId,
    });
    const created = await request(app.getHttpServer())
      .post('/plants')
      .set('Authorization', bearer(userId))
      .send({ scanPublicId })
      .expect(201);
    createdPlantIds.push(await internalPlantId(created.body.id));

    const followUp = await request(app.getHttpServer())
      .post(`/plants/${created.body.id}/photos`)
      .set('Authorization', bearer(userId))
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    expect(followUp.body).toMatchObject({ type: 'comparison', status: 'pending' });

    const one = await request(app.getHttpServer())
      .get(`/plants/${created.body.id}`)
      .set('Authorization', bearer(userId))
      .expect(200);
    // Same plant now has 2 photos in its history (initial + follow-up) — not a new plant.
    expect(one.body.photos).toHaveLength(2);
  });

  describe('tenant isolation (Station 07 §7.5.4, mandatory)', () => {
    it("a second user cannot GET another user's plant by id (404)", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const { publicId: scanPublicId } = await seedScan({
        userId: owner,
        status: 'completed',
        speciesId: seededSpeciesId,
      });
      const created = await request(app.getHttpServer())
        .post('/plants')
        .set('Authorization', bearer(owner))
        .send({ scanPublicId })
        .expect(201);
      createdPlantIds.push(await internalPlantId(created.body.id));

      await request(app.getHttpServer())
        .get(`/plants/${created.body.id}`)
        .set('Authorization', bearer(other))
        .expect(404);
    });

    it("a second user never sees another user's plant in GET /plants", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const { publicId: scanPublicId } = await seedScan({
        userId: owner,
        status: 'completed',
        speciesId: seededSpeciesId,
      });
      const created = await request(app.getHttpServer())
        .post('/plants')
        .set('Authorization', bearer(owner))
        .send({ scanPublicId })
        .expect(201);
      createdPlantIds.push(await internalPlantId(created.body.id));

      const list = await request(app.getHttpServer())
        .get('/plants')
        .set('Authorization', bearer(other))
        .expect(200);
      expect(list.body.data.some((p: { id: string }) => p.id === created.body.id)).toBe(false);
    });

    it("a second user cannot POST a follow-up photo to another user's plant (404)", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const { publicId: scanPublicId } = await seedScan({
        userId: owner,
        status: 'completed',
        speciesId: seededSpeciesId,
      });
      const created = await request(app.getHttpServer())
        .post('/plants')
        .set('Authorization', bearer(owner))
        .send({ scanPublicId })
        .expect(201);
      createdPlantIds.push(await internalPlantId(created.body.id));

      await request(app.getHttpServer())
        .post(`/plants/${created.body.id}/photos`)
        .set('Authorization', bearer(other))
        .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
        .expect(404);
    });
  });
});

/** Resolves a plant's internal ULID from its public_id, for test cleanup only. */
async function internalPlantId(publicId: string): Promise<string> {
  const [row] = await db
    .select({ id: plant.id })
    .from(plant)
    .where(eq(plant.publicId, publicId))
    .limit(1);
  return row.id;
}
