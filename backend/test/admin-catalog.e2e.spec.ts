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
import { species, users } from '../src/db/schema';
import { AdminModule } from '../src/admin/admin.module';
import { PlantsRepository } from '../src/modules/plants/plants.repository';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
let plantsRepo: PlantsRepository;

const createdUserIds: string[] = [];
const createdSpeciesIds: string[] = [];

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(role: 'user' | 'admin'): Promise<{ id: string; publicId: string }> {
  const email = `admin-catalog-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', role })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  return u;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AdminModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  // PlantsRepository has no constructor dependencies (plain Drizzle access) — used
  // directly here (not via DI) purely to prove the identify/plant read path sees
  // the SAME live data the admin just wrote, without pulling in all of PlantsModule.
  plantsRepo = new PlantsRepository();
});

afterAll(async () => {
  await app?.close();
  for (const id of createdSpeciesIds) {
    await db.delete(species).where(eq(species.id, id));
  }
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('Admin species catalog (T-140, US9, FR-024)', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/admin/species').expect(401);
  });

  it('rejects a non-admin authenticated user (403)', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .get('/admin/species')
      .set('Authorization', bearer(member.publicId))
      .expect(403);
  });

  it('admin creates a species with a care guide, then lists it', async () => {
    const admin = await makeUser('admin');

    const created = await request(app.getHttpServer())
      .post('/admin/species')
      .set('Authorization', bearer(admin.publicId))
      .send({
        scientificName: 'Epipremnum aureum',
        commonNameFa: 'پوتوس',
        careGuide: { watering: 'weekly', light: 'indirect' },
      })
      .expect(201);
    expect(created.body.scientificName).toBe('Epipremnum aureum');
    expect(created.body.careGuide).toEqual({ watering: 'weekly', light: 'indirect' });
    const internalId = await internalSpeciesId(created.body.publicId);
    createdSpeciesIds.push(internalId);

    const list = await request(app.getHttpServer())
      .get('/admin/species')
      .set('Authorization', bearer(admin.publicId))
      .expect(200);
    expect(list.body.some((s: { publicId: string }) => s.publicId === created.body.publicId)).toBe(
      true,
    );
  });

  it('a non-admin cannot create a species (403) even with a well-formed body', async () => {
    const member = await makeUser('user');
    await request(app.getHttpServer())
      .post('/admin/species')
      .set('Authorization', bearer(member.publicId))
      .send({ scientificName: 'Should not be created' })
      .expect(403);
  });

  it('rejects an invalid create request (400) — missing required scientificName', async () => {
    const admin = await makeUser('admin');
    await request(app.getHttpServer())
      .post('/admin/species')
      .set('Authorization', bearer(admin.publicId))
      .send({ commonNameFa: 'بدون نام علمی' })
      .expect(400);
  });

  it('editing a species is visible on the very next read anywhere (no cache) — including the identify/plants read path', async () => {
    const admin = await makeUser('admin');

    const created = await request(app.getHttpServer())
      .post('/admin/species')
      .set('Authorization', bearer(admin.publicId))
      .send({ scientificName: 'Monstera deliciosa', commonNameFa: 'مانستِرا' })
      .expect(201);
    const internalId = await internalSpeciesId(created.body.publicId);
    createdSpeciesIds.push(internalId);

    await request(app.getHttpServer())
      .patch(`/admin/species/${created.body.publicId}`)
      .set('Authorization', bearer(admin.publicId))
      .send({ commonNameFa: 'نام جدید', careGuide: { watering: 'biweekly' } })
      .expect(200);

    // PlantsRepository.findSpeciesById is the SAME query the identify/plant read
    // path uses — proving the admin edit is live, not cached, for that consumer.
    const viaConsumer = await plantsRepo.findSpeciesById(internalId);
    expect(viaConsumer?.commonNameFa).toBe('نام جدید');
    expect(viaConsumer?.careGuide).toEqual({ watering: 'biweekly' });
  });

  it('PATCH on an unknown publicId returns 404', async () => {
    const admin = await makeUser('admin');
    await request(app.getHttpServer())
      .patch('/admin/species/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearer(admin.publicId))
      .send({ commonNameFa: 'x' })
      .expect(404);
  });
});

/** Resolves a species' internal ULID from its public_id, for test cleanup/verification only. */
async function internalSpeciesId(publicId: string): Promise<string> {
  const [row] = await db
    .select({ id: species.id })
    .from(species)
    .where(eq(species.publicId, publicId))
    .limit(1);
  return row.id;
}
