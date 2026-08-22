process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:25432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:26379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { misidentificationReport, photo, scan, users } from '../src/db/schema';
import { AdminModule } from '../src/admin/admin.module';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;

const createdUserIds: string[] = [];
const createdScanIds: string[] = [];
const createdReportIds: string[] = [];

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(role: 'user' | 'admin'): Promise<{ id: string; publicId: string }> {
  const email = `admin-reports-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', role })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  return u;
}

/** Mirrors ScansRepository.createIdentifyScan's shape (scan + photo, photo_id backfilled). */
async function makeScanWithPhoto(params: {
  userId: string | null;
  result: unknown;
}): Promise<{ id: string; publicId: string }> {
  const [scanRow] = await db
    .insert(scan)
    .values({ userId: params.userId, type: 'identify', status: 'completed', result: params.result })
    .returning({ id: scan.id, publicId: scan.publicId });
  createdScanIds.push(scanRow.id);

  const [photoRow] = await db
    .insert(photo)
    .values({ scanId: scanRow.id, storageKey: `admin-reports-test/${scanRow.id}` })
    .returning({ id: photo.id });
  await db.update(scan).set({ photoId: photoRow.id }).where(eq(scan.id, scanRow.id));

  return scanRow;
}

async function makeReport(params: {
  userId: string | null;
  scanId: string;
  photoId: string | null;
  aiResult: unknown;
  note: string | null;
}): Promise<{ id: string; publicId: string }> {
  const [row] = await db
    .insert(misidentificationReport)
    .values({
      userId: params.userId,
      scanId: params.scanId,
      photoId: params.photoId,
      aiResult: params.aiResult,
      note: params.note,
    })
    .returning({ id: misidentificationReport.id, publicId: misidentificationReport.publicId });
  createdReportIds.push(row.id);
  return row;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AdminModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  for (const id of createdReportIds) {
    await db.delete(misidentificationReport).where(eq(misidentificationReport.id, id));
  }
  for (const scanId of createdScanIds) {
    await db.delete(photo).where(eq(photo.scanId, scanId));
    await db.delete(scan).where(eq(scan.id, scanId));
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('Admin misidentification reports (T-141, US9, FR-025)', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/admin/misidentification-reports').expect(401);
  });

  it('rejects a non-admin authenticated user (403)', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .get('/admin/misidentification-reports')
      .set('Authorization', bearer(member.publicId))
      .expect(403);
  });

  it('admin lists reports with a signed photo URL and the snapshotted AI result', async () => {
    const admin = await makeUser('admin');
    const reporter = await makeUser('user');
    const aiResult = { species: 'Ficus lyrata', confidence: 0.91 };
    const reportedScan = await makeScanWithPhoto({ userId: reporter.id, result: aiResult });

    const [scanRow] = await db
      .select({ photoId: scan.photoId })
      .from(scan)
      .where(eq(scan.id, reportedScan.id))
      .limit(1);

    const report = await makeReport({
      userId: reporter.id,
      scanId: reportedScan.id,
      photoId: scanRow.photoId,
      aiResult,
      note: 'this is not a fiddle-leaf fig',
    });

    const res = await request(app.getHttpServer())
      .get('/admin/misidentification-reports')
      .set('Authorization', bearer(admin.publicId))
      .expect(200);

    const found = res.body.data.find((r: { id: string }) => r.id === report.publicId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('open');
    expect(found.note).toBe('this is not a fiddle-leaf fig');
    expect(found.aiResult).toMatchObject(aiResult);
    expect(found.scanId).toBe(reportedScan.publicId);
    expect(found.reporterUserId).toBe(reporter.publicId);
    expect(typeof found.photoUrl).toBe('string');
    expect(found.photoUrl).toContain('/v1/photos/');
  });

  it('a guest-submitted report (no reporting user) surfaces reporterUserId: null', async () => {
    const admin = await makeUser('admin');
    const aiResult = { species: 'Monstera deliciosa', confidence: 0.8 };
    const reportedScan = await makeScanWithPhoto({ userId: null, result: aiResult });
    const report = await makeReport({
      userId: null,
      scanId: reportedScan.id,
      photoId: null,
      aiResult,
      note: null,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/misidentification-reports')
      .set('Authorization', bearer(admin.publicId))
      .expect(200);

    const found = res.body.data.find((r: { id: string }) => r.id === report.publicId);
    expect(found).toBeTruthy();
    expect(found.reporterUserId).toBeNull();
    expect(found.photoUrl).toBeNull();
  });
});
