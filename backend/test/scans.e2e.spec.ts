process.env.DISABLE_WORKERS = '1';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
// AppConfigModule (pulled in transitively) validates these at bootstrap; the raw
// db client has a fallback but the validator does not. Match the docker defaults.
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
  scan,
  species,
  usageRecord,
  users,
} from '../src/db/schema';
import { ScansModule } from '../src/modules/scans/scans.module';
import { PLANT_AI_PROVIDER } from '../src/ai-gateway/plant-ai-provider.interface';
import { StorageService } from '../src/common/uploads/storage.service';
import { IdentifyQueue, type IdentifyJobData } from '../src/modules/scans/identify.queue';
import { IdentifyService } from '../src/modules/scans/identify.service';
import { CreditsService } from '../src/credits/credits.service';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

// Mutable AI provider stub: each test sets the next identify() outcome.
const aiMock = {
  identify: async (): Promise<unknown> => ({ confidence: 0.9, speciesId: null, careGuide: {} }),
  compareHealth: async () => ({ verdict: 'unchanged' as const }),
  chat: async () => ({ content: '' }),
};
let nextIdentify: () => Promise<unknown>;

let lastJob: IdentifyJobData;
const createdScanIds: string[] = [];
const queueMock = {
  enqueueIdentify: async (data: IdentifyJobData) => {
    lastJob = data;
    createdScanIds.push(data.scanId);
  },
  onModuleDestroy: async () => {},
};
const storageMock = {
  put: async () => 'test-key',
  getBytes: async () => Buffer.from('img'),
  getCommand: async () => ({}),
};

let app: INestApplication;
let identify: IdentifyService;
let credits: CreditsService;
let seededSpeciesId: string;
const createdUsers: string[] = [];
let pngBuffer: Buffer;

const publicIdByUser = new Map<string, string>();

async function makeUserWithCredits(amount: number): Promise<string> {
  const email = `scan-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', creditBalance: 0 })
    .returning({ id: users.id, publicId: users.publicId });
  createdUsers.push(u.id);
  publicIdByUser.set(u.id, u.publicId);
  await credits.grant(u.id, amount, { idempotencyKey: `grant:${u.id}` });
  return u.id;
}

// Access-token `sub` is the user's public_id (T-040); callers still pass the
// internal id, which we map to the public_id here.
function bearer(userId: string): string {
  const publicId = publicIdByUser.get(userId) ?? userId;
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET)}`;
}

let idemCounter = 0;
function nextIdemKey(): string {
  idemCounter += 1;
  return `e2e-idem-${Date.now()}-${idemCounter}`;
}

beforeAll(async () => {
  aiMock.identify = () => nextIdentify();
  pngBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();

  // Operator config the pipeline reads live.
  await db
    .insert(appConfig)
    .values({ key: 'allowed_photo_file_types', value: ['image/png', 'image/jpeg'] })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: ['image/png', 'image/jpeg'] } });
  await db
    .insert(appConfig)
    .values({ key: 'credit_costs', value: { identify: 1, chat: 1, comparison: 1 } })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: { identify: 1, chat: 1, comparison: 1 } },
    });

  const [sp] = await db
    .insert(species)
    .values({ scientificName: 'Ficus lyrata', commonNameFa: 'فیکوس لیراتا' })
    .returning({ id: species.id });
  seededSpeciesId = sp.id;

  const moduleRef = await Test.createTestingModule({ imports: [ScansModule] })
    .overrideProvider(PLANT_AI_PROVIDER)
    .useValue(aiMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    .overrideProvider(IdentifyQueue)
    .useValue(queueMock)
    .compile();

  app = moduleRef.createNestApplication();
  await app.init();
  identify = app.get(IdentifyService);
  credits = app.get(CreditsService);
});

afterAll(async () => {
  await app?.close();
  // Photos/scans first (FK), for both authenticated and guest scans.
  for (const scanId of createdScanIds) {
    await db.delete(photo).where(eq(photo.scanId, scanId));
    await db.delete(scan).where(eq(scan.id, scanId));
  }
  for (const id of createdUsers) {
    await db.delete(usageRecord).where(eq(usageRecord.userId, id));
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(species).where(eq(species.id, seededSpeciesId));
  // NOTE: the shared app_config keys are intentionally NOT deleted here — they are
  // global settings seeded idempotently by several e2e suites that run in parallel;
  // deleting them would race and break a sibling suite mid-run.
  await pool.end();
});

describe('POST /scans + GET /scans/:id (T-020)', () => {
  it('authenticated high-confidence: pending → completed with species, credit consumed', async () => {
    const userId = await makeUserWithCredits(5);
    nextIdentify = async () => ({
      confidence: 0.92,
      speciesId: seededSpeciesId,
      careGuide: { water: 'weekly' },
    });

    const submit = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    expect(submit.body.status).toBe('pending');
    const publicId = submit.body.id as string;

    await identify.process(lastJob);

    const res = await request(app.getHttpServer())
      .get(`/scans/${publicId}`)
      .set('Authorization', bearer(userId))
      .expect(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.lowConfidence).toBe(false);
    expect(res.body.species).not.toBeNull();
    expect(res.body.careGuide).toMatchObject({ water: 'weekly' });
    expect(await credits.getBalance(userId)).toBe(4); // 5 - 1
  });

  it('authenticated low-confidence: completed without species, prompt present, credit still consumed', async () => {
    const userId = await makeUserWithCredits(5);
    nextIdentify = async () => ({ confidence: 0.5, speciesId: seededSpeciesId, careGuide: {} });

    const submit = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    await identify.process(lastJob);

    const res = await request(app.getHttpServer()).get(`/scans/${submit.body.id}`).expect(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.lowConfidence).toBe(true);
    expect(res.body.species).toBeNull();
    expect(typeof res.body.message).toBe('string');
    expect(await credits.getBalance(userId)).toBe(4);
  });

  it('authenticated AI failure: scan failed and credit refunded (balance unchanged) [FR-017]', async () => {
    const userId = await makeUserWithCredits(5);
    const before = await credits.getBalance(userId);
    nextIdentify = async () => {
      throw new Error('provider down');
    };

    const submit = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    await identify.process(lastJob);

    const res = await request(app.getHttpServer()).get(`/scans/${submit.body.id}`).expect(200);
    expect(res.body.status).toBe('failed');
    expect(typeof res.body.message).toBe('string');
    expect(await credits.getBalance(userId)).toBe(before); // debited then refunded
  });

  it('authenticated retry with the same Idempotency-Key is rejected and never double-charges', async () => {
    const userId = await makeUserWithCredits(5);
    const key = nextIdemKey();
    nextIdentify = async () => ({ confidence: 0.9, speciesId: seededSpeciesId, careGuide: {} });

    const first = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', key)
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    await identify.process(lastJob);
    expect(await credits.getBalance(userId)).toBe(4); // charged once

    // Same key again → 409 conflict, no second debit.
    await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', key)
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(409);
    expect(await credits.getBalance(userId)).toBe(4); // unchanged
    expect(first.body.status).toBe('pending');
  });

  it('guest submission: accepted and processed without any ledger activity', async () => {
    nextIdentify = async () => ({ confidence: 0.95, speciesId: seededSpeciesId, careGuide: {} });

    const submit = await request(app.getHttpServer())
      .post('/scans')
      .attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' })
      .expect(202);
    expect(lastJob.usageRecordId).toBeNull();
    await identify.process(lastJob);

    const res = await request(app.getHttpServer()).get(`/scans/${submit.body.id}`).expect(200);
    expect(res.body.status).toBe('completed');
  });
});
