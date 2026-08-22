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
import { pool } from '../src/db/client';
import { AppModule } from '../src/app.module';

/**
 * Integration smoke for the full app wiring (T-037/057/077/097/107/117/127/137/147):
 * the whole AppModule must compile (every feature module's DI resolves) and its
 * routes must be mounted (respond, not 404). Workers are disabled so no live
 * BullMQ loop runs; the health check confirms bootstrap succeeded.
 */
describe('AppModule wiring — all feature modules registered', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('boots with every feature module registered (DI resolves)', () => {
    expect(app).toBeDefined();
  });

  it('GET /v1/health responds ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('feature routes are mounted (not 404)', async () => {
    // Each should respond with a real handler status (400/401/415/...), never 404.
    const scans = await request(app.getHttpServer()).post('/v1/scans');
    expect(scans.status).not.toBe(404);

    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({});
    expect(login.status).not.toBe(404);

    const plans = await request(app.getHttpServer()).get('/v1/subscriptions/plans');
    expect(plans.status).not.toBe(404);

    const plants = await request(app.getHttpServer()).get('/v1/plants');
    expect(plants.status).toBe(401); // JwtAuthGuard active, no token

    const admin = await request(app.getHttpServer()).get('/v1/admin/users');
    expect(admin.status).toBe(401); // guarded

    const deletion = await request(app.getHttpServer()).get('/v1/account/deletion');
    expect(deletion.status).toBe(401); // guarded
  });
});
