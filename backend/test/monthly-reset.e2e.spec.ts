process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:25432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:26379';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { creditTransaction, subscriptionTier, users } from '../src/db/schema';
import { JobsModule } from '../src/jobs/jobs.module';
import { MonthlyCreditResetProcessor } from '../src/jobs/monthly-credit-reset.processor';
import { CreditsService } from '../src/credits/credits.service';

const TIER_ALLOWANCE = 500;
const BUMPED_ALLOWANCE = 750;

let processor: MonthlyCreditResetProcessor;
let credits: CreditsService;
let tierId: string;

interface ProTierSnapshot {
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}
let originalProTier: ProTierSnapshot | null = null;

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const email = `monthly-reset-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id });
  createdUserIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  // subscription_tier is shared state — save/restore 'pro', never clobber
  // (Station 17 rule; mirrors admin-config.e2e.spec.ts's precedent for 'free').
  const [existing] = await db
    .select({
      monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      priceMinor: subscriptionTier.priceMinor,
      currency: subscriptionTier.currency,
      active: subscriptionTier.active,
    })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'pro'))
    .limit(1);
  originalProTier = existing ?? null;
  await db
    .insert(subscriptionTier)
    .values({
      key: 'pro',
      monthlyCreditAllowance: TIER_ALLOWANCE,
      priceMinor: 100000,
      active: true,
    })
    .onConflictDoUpdate({
      target: subscriptionTier.key,
      set: { monthlyCreditAllowance: TIER_ALLOWANCE, active: true },
    });

  const [tier] = await db
    .select({ id: subscriptionTier.id })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'pro'))
    .limit(1);
  tierId = tier.id;

  const moduleRef = await Test.createTestingModule({ imports: [JobsModule] }).compile();
  processor = moduleRef.get(MonthlyCreditResetProcessor);
  credits = moduleRef.get(CreditsService);
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(creditTransaction).where(inArray(creditTransaction.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (originalProTier) {
    await db.update(subscriptionTier).set(originalProTier).where(eq(subscriptionTier.key, 'pro'));
  } else {
    await db.delete(subscriptionTier).where(eq(subscriptionTier.key, 'pro'));
  }
  await pool.end();
});

describe('MonthlyCreditResetProcessor (T-082, FR-016/FR-019)', () => {
  it("grants the tier's current allowance exactly once per user per cycle, and re-running the same cycle is a no-op", async () => {
    const userId = await makeUser();
    await db.update(users).set({ subscriptionTierId: tierId }).where(eq(users.id, userId));

    const cycleKey = '2026-07';
    const first = await processor.runCycle(cycleKey);
    expect(first.failed).toBe(0);

    expect(await credits.getBalance(userId)).toBe(TIER_ALLOWANCE);

    // Re-run for the SAME cycle: idempotent — no double grant.
    const second = await processor.runCycle(cycleKey);
    expect(second.failed).toBe(0);
    expect(await credits.getBalance(userId)).toBe(TIER_ALLOWANCE);
  });

  it("reads the tier's CURRENT admin-configured allowance at run time — an allowance bump applies to the next cycle only, never retroactively", async () => {
    const userId = await makeUser();
    await db.update(users).set({ subscriptionTierId: tierId }).where(eq(users.id, userId));

    await processor.runCycle('2026-08');
    expect(await credits.getBalance(userId)).toBe(TIER_ALLOWANCE);

    // Admin bumps the tier's allowance.
    await db
      .update(subscriptionTier)
      .set({ monthlyCreditAllowance: BUMPED_ALLOWANCE })
      .where(eq(subscriptionTier.id, tierId));

    await processor.runCycle('2026-09');
    expect(await credits.getBalance(userId)).toBe(TIER_ALLOWANCE + BUMPED_ALLOWANCE);

    // Re-running the ALREADY-processed 2026-08 cycle must not re-grant, at
    // either the old or the new allowance.
    await processor.runCycle('2026-08');
    expect(await credits.getBalance(userId)).toBe(TIER_ALLOWANCE + BUMPED_ALLOWANCE);
  });

  it('a user with no assigned tier falls back to the free tier allowance', async () => {
    const [existingFree] = await db
      .select({
        id: subscriptionTier.id,
        monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.key, 'free'))
      .limit(1);
    if (!existingFree) {
      // 'free' is shared with other suites — only insert if genuinely absent,
      // and leave it in place afterward (other suites already do the same).
      await db
        .insert(subscriptionTier)
        .values({ key: 'free', monthlyCreditAllowance: 30, priceMinor: 0 });
    }
    const [free] = await db
      .select({ monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.key, 'free'))
      .limit(1);

    const userId = await makeUser(); // subscriptionTierId stays null
    await processor.runCycle('2026-10-free');
    expect(await credits.getBalance(userId)).toBe(free.monthlyCreditAllowance);
  });
});
