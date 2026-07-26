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
import { inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { users } from '../src/db/schema';
import { AuthModule } from '../src/modules/auth/auth.module';

let app: INestApplication;
const emails: string[] = [];

function email(): string {
  const e = `auth-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  emails.push(e);
  return e;
}

/** Extract a specific cookie's `name=value` pair from a Set-Cookie header. */
function cookiePair(res: request.Response, name: string): string {
  const raw = (res.headers['set-cookie'] as unknown as string[]) ?? [];
  const found = raw.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`cookie ${name} not set`);
  return found.split(';')[0];
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  if (emails.length > 0) await db.delete(users).where(inArray(users.email, emails));
  await app?.close();
  await pool.end();
});

describe('Auth lifecycle (T-040, FR-007)', () => {
  it('register → login → refresh(rotates) → logout, with denylist enforcement', async () => {
    const e = email();
    const agent = request.agent(app.getHttpServer());

    // register
    const reg = await agent
      .post('/auth/register')
      .send({ email: e, password: 'secret123' })
      .expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.expiresIn).toBeGreaterThan(0);
    expect(JSON.stringify(reg.body)).not.toContain('password'); // never leak the hash
    const originalRefresh = cookiePair(reg, 'refresh-token');

    // login (fresh agent) returns a working access token + refresh cookie
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: e, password: 'secret123' })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();

    // refresh rotates: new access token issued, and the ORIGINAL refresh token is now dead
    const refreshed = await agent.post('/auth/refresh').expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalRefresh)
      .expect(401);

    // logout revokes the current refresh token; a subsequent refresh fails
    await agent.post('/auth/logout').expect(204);
    await agent.post('/auth/refresh').expect(401);
  });

  it('duplicate-email registration returns 409', async () => {
    const e = email();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: e, password: 'secret123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: e, password: 'secret123' })
      .expect(409);
  });

  it('wrong-password login returns 401', async () => {
    const e = email();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: e, password: 'secret123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: e, password: 'WRONGpass9' })
      .expect(401);
  });

  it('weak password is rejected at validation (400)', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email(), password: 'short' })
      .expect(400);
  });
});
