process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:15432/plant';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, pool } from '../src/db/client';
import { misidentificationReport, photo, scan, users } from '../src/db/schema';
import { MisidentificationReportsModule } from '../src/modules/misidentification-reports/misidentification-reports.module';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
const createdUsers: string[] = [];
const createdScans: string[] = [];
const createdReports: string[] = [];

const publicIdByUser = new Map<string, string>();

// Access-token `sub` is the user's public_id + a `typ: 'access'` claim (T-040).
// Callers pass the internal id, which we map to the public_id here.
function bearer(userId: string): string {
  const publicId = publicIdByUser.get(userId) ?? userId;
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET)}`;
}

async function makeUser(): Promise<string> {
  const email = `misid-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id, publicId: users.publicId });
  createdUsers.push(u.id);
  publicIdByUser.set(u.id, u.publicId);
  return u.id;
}

/** Mirrors ScansRepository.createIdentifyScan's shape (scan + photo, photo_id backfilled). */
async function makeScan(params: {
  userId: string | null;
  status?: 'pending' | 'completed' | 'failed';
  result?: unknown;
}): Promise<{ id: string; publicId: string }> {
  const [scanRow] = await db
    .insert(scan)
    .values({
      userId: params.userId,
      type: 'identify',
      status: params.status ?? 'completed',
      result: params.result ?? { species: 'Ficus lyrata', confidence: 0.92 },
    })
    .returning({ id: scan.id, publicId: scan.publicId });
  createdScans.push(scanRow.id);

  const [photoRow] = await db
    .insert(photo)
    .values({ scanId: scanRow.id, storageKey: `test/${scanRow.id}` })
    .returning({ id: photo.id });
  await db.update(scan).set({ photoId: photoRow.id }).where(eq(scan.id, scanRow.id));

  return scanRow;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [MisidentificationReportsModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  for (const id of createdReports) {
    await db.delete(misidentificationReport).where(eq(misidentificationReport.id, id));
  }
  for (const scanId of createdScans) {
    await db.delete(photo).where(eq(photo.scanId, scanId));
    await db.delete(scan).where(eq(scan.id, scanId));
  }
  for (const id of createdUsers) {
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('POST /misidentification-reports (T-022)', () => {
  it('valid report on a completed scan: 201 with persisted photo + ai_result snapshot', async () => {
    const userId = await makeUser();
    const result = { species: 'Ficus lyrata', confidence: 0.92 };
    const s = await makeScan({ userId, result });

    const res = await request(app.getHttpServer())
      .post('/misidentification-reports')
      .set('Authorization', bearer(userId))
      .send({ scanId: s.publicId, note: 'this is not a fiddle-leaf fig' })
      .expect(201);

    expect(res.body.status).toBe('open');
    expect(typeof res.body.id).toBe('string');

    const [row] = await db
      .select()
      .from(misidentificationReport)
      .where(eq(misidentificationReport.publicId, res.body.id))
      .limit(1);
    createdReports.push(row.id);

    expect(row.userId).toBe(userId);
    expect(row.scanId).toBe(s.id);
    expect(row.photoId).not.toBeNull();
    expect(row.aiResult).toMatchObject(result);
    expect(row.note).toBe('this is not a fiddle-leaf fig');
    expect(row.status).toBe('open');
  });

  it('nonexistent scanId: 404 problem', async () => {
    const userId = await makeUser();

    await request(app.getHttpServer())
      .post('/misidentification-reports')
      .set('Authorization', bearer(userId))
      .send({ scanId: randomUUID() })
      .expect(404);
  });

  it('over-length note: 400 problem, nothing persisted', async () => {
    const userId = await makeUser();
    const s = await makeScan({ userId });

    await request(app.getHttpServer())
      .post('/misidentification-reports')
      .set('Authorization', bearer(userId))
      .send({ scanId: s.publicId, note: 'x'.repeat(1001) })
      .expect(400);

    const rows = await db
      .select()
      .from(misidentificationReport)
      .where(eq(misidentificationReport.scanId, s.id));
    expect(rows).toHaveLength(0);
  });

  it('foreign (not-owned) scanId while authenticated: 403 problem', async () => {
    const owner = await makeUser();
    const otherUser = await makeUser();
    const s = await makeScan({ userId: owner });

    await request(app.getHttpServer())
      .post('/misidentification-reports')
      .set('Authorization', bearer(otherUser))
      .send({ scanId: s.publicId })
      .expect(403);
  });

  it('guest-submitted report (no auth header) on a guest-owned scan: 201', async () => {
    const s = await makeScan({ userId: null });

    const res = await request(app.getHttpServer())
      .post('/misidentification-reports')
      .send({ scanId: s.publicId })
      .expect(201);

    expect(res.body.status).toBe('open');

    const [row] = await db
      .select()
      .from(misidentificationReport)
      .where(eq(misidentificationReport.publicId, res.body.id))
      .limit(1);
    createdReports.push(row.id);

    expect(row.userId).toBeNull();
    expect(row.scanId).toBe(s.id);
  });
});
