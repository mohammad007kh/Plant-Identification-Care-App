process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:15432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:16379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db, pool } from '../src/db/client';
import { guestSession, scan, users } from '../src/db/schema';
import { AuthModule } from '../src/modules/auth/auth.module';

let app: INestApplication;
const emails: string[] = [];
const guestIds: string[] = [];
const scanIds: string[] = [];

function email(): string {
  const e = `merge-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  emails.push(e);
  return e;
}

/** Seed a guest session with `n` completed scans; returns the guest session id. */
async function seedGuestWithScans(n: number): Promise<string> {
  const gid = ulid();
  guestIds.push(gid);
  await db
    .insert(guestSession)
    .values({ id: gid, ipHash: `h-${gid}`, scanCount: n, status: 'active' });
  for (let i = 0; i < n; i++) {
    const sid = ulid();
    scanIds.push(sid);
    await db
      .insert(scan)
      .values({ id: sid, guestSessionId: gid, type: 'identify', status: 'completed' });
  }
  return gid;
}

async function userIdByEmail(e: string): Promise<string> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
  return u.id;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  if (scanIds.length > 0) await db.delete(scan).where(inArray(scan.id, scanIds));
  if (guestIds.length > 0) await db.delete(guestSession).where(inArray(guestSession.id, guestIds));
  if (emails.length > 0) await db.delete(users).where(inArray(users.email, emails));
  await app?.close();
  await pool.end();
});

describe('Guest → account merge on registration (T-041, FR-008)', () => {
  it('re-parents all guest scans to the new user and converts the session once', async () => {
    const gid = await seedGuestWithScans(2);
    const e = email();

    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Cookie', `guest-id=${gid}`)
      .send({ email: e, password: 'secret123' })
      .expect(201);

    const uid = await userIdByEmail(e);
    const owned = await db.select({ id: scan.id }).from(scan).where(eq(scan.userId, uid));
    expect(owned).toHaveLength(2); // zero scan loss

    const stillGuest = await db
      .select({ id: scan.id })
      .from(scan)
      .where(eq(scan.guestSessionId, gid));
    expect(stillGuest).toHaveLength(0); // guest_session_id cleared

    const [session] = await db
      .select({ status: guestSession.status, converted: guestSession.convertedToUserId })
      .from(guestSession)
      .where(eq(guestSession.id, gid))
      .limit(1);
    expect(session.status).toBe('converted');
    expect(session.converted).toBe(uid);
  });

  it('concurrent registrations with the same guest cookie merge exactly once (no doubling)', async () => {
    const gid = await seedGuestWithScans(2);
    const e1 = email();
    const e2 = email();

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/register')
        .set('Cookie', `guest-id=${gid}`)
        .send({ email: e1, password: 'secret123' }),
      request(app.getHttpServer())
        .post('/auth/register')
        .set('Cookie', `guest-id=${gid}`)
        .send({ email: e2, password: 'secret123' }),
    ]);
    expect([r1.status, r2.status].every((s) => s === 201)).toBe(true);

    const u1 = await userIdByEmail(e1);
    const u2 = await userIdByEmail(e2);
    const c1 = (await db.select({ id: scan.id }).from(scan).where(eq(scan.userId, u1))).length;
    const c2 = (await db.select({ id: scan.id }).from(scan).where(eq(scan.userId, u2))).length;
    // Exactly one registrant got all 2 scans; the other got none — never doubled.
    expect([c1, c2].sort()).toEqual([0, 2]);

    const [session] = await db
      .select({ status: guestSession.status })
      .from(guestSession)
      .where(eq(guestSession.id, gid))
      .limit(1);
    expect(session.status).toBe('converted');
  });

  it('registering with no guest cookie succeeds with zero scans merged', async () => {
    const e = email();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: e, password: 'secret123' })
      .expect(201);
    const uid = await userIdByEmail(e);
    const owned = await db.select({ id: scan.id }).from(scan).where(eq(scan.userId, uid));
    expect(owned).toHaveLength(0);
  });
});
