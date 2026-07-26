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
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { analyticsEvent, users } from '../src/db/schema';
import { AdminModule } from '../src/admin/admin.module';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;

const createdUserIds: string[] = [];

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(
  role: 'user' | 'admin',
  extra: { email?: string; creditBalance?: number } = {},
): Promise<{ id: string; publicId: string; email: string }> {
  const email =
    extra.email ??
    `admin-users-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', role, creditBalance: extra.creditBalance ?? 0 })
    .returning({ id: users.id, publicId: users.publicId, email: users.email });
  createdUserIds.push(u.id);
  return u;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AdminModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await db.delete(analyticsEvent).where(eq(analyticsEvent.name, 'admin.user_action'));
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('Admin users (T-141, US9, FR-026)', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
  });

  it('rejects a non-admin authenticated user (403)', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearer(member.publicId))
      .expect(403);
  });

  it('admin searches users by email substring and finds status/tier/balance, with no password material', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user', {
      email: `findme-${Date.now()}@test.local`,
      creditBalance: 7,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .query({ q: 'findme-' })
      .set('Authorization', bearer(admin.publicId))
      .expect(200);

    const found = res.body.data.find((u: { publicId: string }) => u.publicId === target.publicId);
    expect(found).toBeTruthy();
    expect(found).toMatchObject({
      publicId: target.publicId,
      email: target.email,
      role: 'user',
      status: 'active',
      creditBalance: 7,
    });
    expect(found).not.toHaveProperty('passwordHash');
    expect(found).not.toHaveProperty('id');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('admin searches by exact public_id', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user');

    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .query({ q: target.publicId })
      .set('Authorization', bearer(admin.publicId))
      .expect(200);

    expect(res.body.data.some((u: { publicId: string }) => u.publicId === target.publicId)).toBe(
      true,
    );
  });

  it('admin views a user detail by public id', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user');

    const res = await request(app.getHttpServer())
      .get(`/admin/users/${target.publicId}`)
      .set('Authorization', bearer(admin.publicId))
      .expect(200);

    expect(res.body.publicId).toBe(target.publicId);
  });

  it('detail on an unknown public id returns 404', async () => {
    const admin = await makeUser('admin');
    await request(app.getHttpServer())
      .get('/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearer(admin.publicId))
      .expect(404);
  });

  it('a non-admin cannot search users (403) even though a well-formed query is supplied', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .get('/admin/users')
      .query({ q: 'anything' })
      .set('Authorization', bearer(member.publicId))
      .expect(403);
  });

  it('a mutating credit-adjustment action updates the balance and writes an audit record', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user', { creditBalance: 10 });

    const res = await request(app.getHttpServer())
      .patch(`/admin/users/${target.publicId}`)
      .set('Authorization', bearer(admin.publicId))
      .send({ creditAdjustment: 5, reason: 'goodwill credit — e2e test' })
      .expect(200);

    expect(res.body.creditBalance).toBe(15);

    const [targetInternal] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, target.publicId))
      .limit(1);
    const [audit] = await db
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.userId, targetInternal.id))
      .limit(1);
    expect(audit).toBeTruthy();
    expect(audit.name).toBe('admin.user_action');
    expect(audit.props).toMatchObject({
      reason: 'goodwill credit — e2e test',
      changes: { creditAdjustment: 5, newCreditBalance: 15 },
    });
  });

  it('rejects (400) a credit adjustment that would drive the balance negative', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user', { creditBalance: 3 });

    await request(app.getHttpServer())
      .patch(`/admin/users/${target.publicId}`)
      .set('Authorization', bearer(admin.publicId))
      .send({ creditAdjustment: -10, reason: 'attempted overdraw' })
      .expect(400);

    const [row] = await db
      .select({ creditBalance: users.creditBalance })
      .from(users)
      .where(eq(users.publicId, target.publicId))
      .limit(1);
    expect(row.creditBalance).toBe(3);
  });

  it('rejects (400) a PATCH body missing a reason', async () => {
    const admin = await makeUser('admin');
    const target = await makeUser('user');
    await request(app.getHttpServer())
      .patch(`/admin/users/${target.publicId}`)
      .set('Authorization', bearer(admin.publicId))
      .send({ creditAdjustment: 1 })
      .expect(400);
  });

  it('a non-admin cannot act on a user account (403), balance unchanged', async () => {
    const member = await makeUser('user');
    const target = await makeUser('user', { creditBalance: 5 });

    await request(app.getHttpServer())
      .patch(`/admin/users/${target.publicId}`)
      .set('Authorization', bearer(member.publicId))
      .send({ creditAdjustment: 1, reason: 'should not apply' })
      .expect(403);

    const [row] = await db
      .select({ creditBalance: users.creditBalance })
      .from(users)
      .where(eq(users.publicId, target.publicId))
      .limit(1);
    expect(row.creditBalance).toBe(5);
  });

  it('PATCH on an unknown public id returns 404', async () => {
    const admin = await makeUser('admin');
    await request(app.getHttpServer())
      .patch('/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearer(admin.publicId))
      .send({ creditAdjustment: 1, reason: 'x' })
      .expect(404);
  });
});
