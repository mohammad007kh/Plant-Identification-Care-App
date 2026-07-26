process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { planSchema } from 'shared';
import { db, pool } from '../src/db/client';
import { subscriptionTier } from '../src/db/schema';
import { SubscriptionsModule } from '../src/modules/subscriptions/subscriptions.module';

let app: INestApplication;

interface FreeTierSnapshot {
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}
let originalFreeTier: FreeTierSnapshot | null = null;

beforeAll(async () => {
  // subscription_tier is shared state other suites rely on (Station 17 rule:
  // never delete/clobber a shared row you didn't create) — save 'free' so we
  // can restore it exactly, mirroring admin-config.e2e.spec.ts's precedent.
  const [existing] = await db
    .select({
      monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      priceMinor: subscriptionTier.priceMinor,
      currency: subscriptionTier.currency,
      active: subscriptionTier.active,
    })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'free'))
    .limit(1);
  originalFreeTier = existing ?? null;
  if (!existing) {
    await db
      .insert(subscriptionTier)
      .values({ key: 'free', monthlyCreditAllowance: 30, priceMinor: 0, active: true });
  } else if (!existing.active) {
    await db.update(subscriptionTier).set({ active: true }).where(eq(subscriptionTier.key, 'free'));
  }

  const moduleRef = await Test.createTestingModule({ imports: [SubscriptionsModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  if (originalFreeTier) {
    await db.update(subscriptionTier).set(originalFreeTier).where(eq(subscriptionTier.key, 'free'));
  } else {
    await db.delete(subscriptionTier).where(eq(subscriptionTier.key, 'free'));
  }
  await pool.end();
});

describe('GET /subscriptions/plans (T-080, FR-014/FR-016/SC-006)', () => {
  it('returns active tiers read live from the DB, matching the shared Plan schema', async () => {
    const res = await request(app.getHttpServer()).get('/subscriptions/plans').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: { key: string }) => p.key === 'free')).toBe(true);
    for (const plan of res.body) {
      expect(() => planSchema.parse(plan)).not.toThrow();
    }
  });

  it('reflects a DB-level allowance change on the very next call, no restart needed', async () => {
    const before = await request(app.getHttpServer()).get('/subscriptions/plans').expect(200);
    const freeBefore = before.body.find((p: { key: string }) => p.key === 'free');
    expect(freeBefore).toBeDefined();

    await db
      .update(subscriptionTier)
      .set({ monthlyCreditAllowance: freeBefore.monthlyCreditAllowance + 5 })
      .where(eq(subscriptionTier.key, 'free'));

    const after = await request(app.getHttpServer()).get('/subscriptions/plans').expect(200);
    const freeAfter = after.body.find((p: { key: string }) => p.key === 'free');
    expect(freeAfter.monthlyCreditAllowance).toBe(freeBefore.monthlyCreditAllowance + 5);
  });

  it('excludes an inactive tier from the public list', async () => {
    await db
      .update(subscriptionTier)
      .set({ active: false })
      .where(eq(subscriptionTier.key, 'free'));
    const res = await request(app.getHttpServer()).get('/subscriptions/plans').expect(200);
    expect(res.body.some((p: { key: string }) => p.key === 'free')).toBe(false);

    await db.update(subscriptionTier).set({ active: true }).where(eq(subscriptionTier.key, 'free'));
    const restored = await request(app.getHttpServer()).get('/subscriptions/plans').expect(200);
    expect(restored.body.some((p: { key: string }) => p.key === 'free')).toBe(true);
  });
});
