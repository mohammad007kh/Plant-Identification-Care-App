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
import { creditTransaction, subscriptionTier, users } from '../src/db/schema';
import { CreditsModule } from '../src/credits/credits.module';
import { CreditsService } from '../src/credits/credits.service';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
let credits: CreditsService;
let freeTierId: string;
const createdUserIds: string[] = [];

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(): Promise<{ id: string; publicId: string }> {
  const email = `credits-balance-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  return u;
}

beforeAll(async () => {
  const [existing] = await db
    .select({ id: subscriptionTier.id })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'free'))
    .limit(1);
  if (existing) {
    freeTierId = existing.id;
  } else {
    const [created] = await db
      .insert(subscriptionTier)
      .values({ key: 'free', monthlyCreditAllowance: 30, priceMinor: 0 })
      .returning({ id: subscriptionTier.id });
    freeTierId = created.id;
  }

  const moduleRef = await Test.createTestingModule({ imports: [CreditsModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  credits = app.get(CreditsService);
});

afterAll(async () => {
  await app?.close();
  for (const id of createdUserIds) {
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('GET /credits/balance (T-080, FR-014/FR-016)', () => {
  it('rejects an unauthenticated request (401)', async () => {
    await request(app.getHttpServer()).get('/credits/balance').expect(401);
  });

  it("returns the caller's own balance + tier, never leaking another user's balance", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await db.update(users).set({ subscriptionTierId: freeTierId }).where(eq(users.id, userA.id));
    await credits.grant(userA.id, 7, { idempotencyKey: `grant:${userA.id}` });
    await credits.grant(userB.id, 42, { idempotencyKey: `grant:${userB.id}` });

    const resA = await request(app.getHttpServer())
      .get('/credits/balance')
      .set('Authorization', bearer(userA.publicId))
      .expect(200);
    expect(resA.body).toEqual({ balance: 7, tier: 'free' });

    const resB = await request(app.getHttpServer())
      .get('/credits/balance')
      .set('Authorization', bearer(userB.publicId))
      .expect(200);
    expect(resB.body.balance).toBe(42); // isolated from userA's balance
    expect(resB.body.tier).toBe('free'); // no tier assigned yet -> defaults to free
  });
});
