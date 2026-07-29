process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:15432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:16379';
process.env.GUEST_IP_DAILY_CAP = '5';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { appConfig, guestSession, photo, scan } from '../src/db/schema';
import { ScansModule } from '../src/modules/scans/scans.module';
import { PLANT_AI_PROVIDER } from '../src/ai-gateway/plant-ai-provider.interface';
import { StorageService } from '../src/common/uploads/storage.service';
import { IdentifyQueue, type IdentifyJobData } from '../src/modules/scans/identify.queue';

const IP_SALT = process.env.GUEST_IP_HASH_SALT ?? 'plant-guest-salt';
const hashIp = (ip: string): string =>
  createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex');

const run = Date.now();
const IP_COUNTER = `10.0.0.1-${run}`;
const IP_RACE = `10.0.0.2-${run}`;
const IP_BACKSTOP = `10.0.0.3-${run}`;

const createdScanIds: string[] = [];
const queueMock = {
  enqueueIdentify: async (data: IdentifyJobData) => {
    createdScanIds.push(data.scanId);
  },
  onModuleDestroy: async () => {},
};
const storageMock = {
  put: async () => 'test-key',
  getBytes: async () => Buffer.from('img'),
  getCommand: async () => ({}),
};
const aiMock = {
  identify: async () => ({ confidence: 0.9, speciesId: null, careGuide: {} }),
  compareHealth: async () => ({ verdict: 'unchanged' as const }),
  chat: async () => ({ content: '' }),
};

let app: INestApplication;
let pngBuffer: Buffer;

function attachPhoto(r: request.Test): request.Test {
  return r.attach('photo', pngBuffer, { filename: 'leaf.png', contentType: 'image/png' });
}

function guestIdFromSetCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!raw || raw.length === 0) throw new Error('no Set-Cookie on guest response');
  return raw[0].split(';')[0].split('=')[1];
}

beforeAll(async () => {
  pngBuffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();

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
});

afterAll(async () => {
  await app?.close();
  if (createdScanIds.length > 0) {
    await db.delete(photo).where(inArray(photo.scanId, createdScanIds));
    await db.delete(scan).where(inArray(scan.id, createdScanIds));
  }
  for (const ip of [IP_COUNTER, IP_RACE, IP_BACKSTOP]) {
    await db.delete(guestSession).where(eq(guestSession.ipHash, hashIp(ip)));
  }
  // Shared app_config keys are intentionally NOT deleted (seeded idempotently by
  // parallel e2e suites — deleting them would race and break a sibling suite).
  await pool.end();
});

describe('Guest scan limit (T-021, FR-006)', () => {
  it('allows exactly 2 scans per guest session; the 3rd hits the registration wall (403)', async () => {
    const agent = request.agent(app.getHttpServer());

    const first = await attachPhoto(agent.post('/scans').set('X-Forwarded-For', IP_COUNTER)).expect(
      202,
    );
    const guestId = guestIdFromSetCookie(first);
    await attachPhoto(agent.post('/scans').set('X-Forwarded-For', IP_COUNTER)).expect(202);
    await attachPhoto(agent.post('/scans').set('X-Forwarded-For', IP_COUNTER)).expect(403);

    const [row] = await db
      .select({ scanCount: guestSession.scanCount })
      .from(guestSession)
      .where(eq(guestSession.id, guestId))
      .limit(1);
    expect(row.scanCount).toBe(2); // never went to 3
  });

  it('concurrent requests can never push a guest past 2 scans (atomic guarded increment)', async () => {
    const agent = request.agent(app.getHttpServer());
    // First scan establishes the cookie/session (count → 1).
    await attachPhoto(agent.post('/scans').set('X-Forwarded-For', IP_RACE)).expect(202);

    // Fire 3 concurrent 2nd-attempts on the same session: exactly ONE may win.
    const settled = await Promise.all(
      Array.from({ length: 3 }, () =>
        attachPhoto(agent.post('/scans').set('X-Forwarded-For', IP_RACE)).then((r) => r.status),
      ),
    );
    const ok = settled.filter((s) => s === 202).length;
    const rejected = settled.filter((s) => s === 403).length;
    expect(ok).toBe(1);
    expect(rejected).toBe(2);
  });

  it('per-IP daily backstop caps new guest sessions from one IP (cookie-clearing abuse)', async () => {
    // No cookie jar → each request mints a fresh guest session from the same IP.
    // Cap is 5, so the 6th cookie-less request is rejected (429).
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await attachPhoto(
        request(app.getHttpServer()).post('/scans').set('X-Forwarded-For', IP_BACKSTOP),
      );
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 202).length).toBe(5);
    expect(statuses[5]).toBe(429);
  });
});
