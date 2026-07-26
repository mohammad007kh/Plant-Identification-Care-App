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
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { creditTransaction, paymentEvent, subscriptionTier, users } from '../src/db/schema';
import { PaymentsModule } from '../src/modules/payments/payments.module';
import { PAYMENT_PORT, type PaymentPort } from '../src/modules/payments/ports/payment.port';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

let app: INestApplication;
let appFailing: INestApplication;
let tierPublicId: string;
let tierInternalId: string;
const TIER_ALLOWANCE = 1500;
const TIER_PRICE_MINOR = 900000;

interface MaxTierSnapshot {
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}
let originalMaxTier: MaxTierSnapshot | null = null;

const createdUserIds: string[] = [];

function bearer(publicId: string): string {
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

async function makeUser(): Promise<{ id: string; publicId: string }> {
  const email = `payments-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x' })
    .returning({ id: users.id, publicId: users.publicId });
  createdUserIds.push(u.id);
  return u;
}

/** Extracts the mock Authority from a `https://mock-zarinpal.local/pay/<Authority>` redirect URL. */
function authorityFrom(redirectUrl: string): string {
  return redirectUrl.split('/').pop() as string;
}

// A deterministic PaymentPort double that ALWAYS reports adapter-verified
// failure, regardless of what the client's Status query param says — used to
// exercise the "adapter says failed" branch (the real ZarinpalMockAdapter only
// fails for authorities it never issued).
const failingAdapter: PaymentPort = {
  initiateCheckout: async () => {
    const providerRef = `MOCK-FAIL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { redirectUrl: `https://mock-zarinpal.local/pay/${providerRef}`, providerRef };
  },
  verify: async (providerRef) => ({ status: 'failed', amountMinor: 0, providerRef }),
};

beforeAll(async () => {
  // subscription_tier is shared state (Station 17 rule: never clobber a row
  // you didn't create) — save/restore 'max', mirroring admin-config's precedent.
  const [existing] = await db
    .select({
      monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      priceMinor: subscriptionTier.priceMinor,
      currency: subscriptionTier.currency,
      active: subscriptionTier.active,
    })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'max'))
    .limit(1);
  originalMaxTier = existing ?? null;
  await db
    .insert(subscriptionTier)
    .values({
      key: 'max',
      monthlyCreditAllowance: TIER_ALLOWANCE,
      priceMinor: TIER_PRICE_MINOR,
      currency: 'IRR',
      active: true,
    })
    .onConflictDoUpdate({
      target: subscriptionTier.key,
      set: {
        monthlyCreditAllowance: TIER_ALLOWANCE,
        priceMinor: TIER_PRICE_MINOR,
        currency: 'IRR',
        active: true,
      },
    });

  const [tier] = await db
    .select({ id: subscriptionTier.id, publicId: subscriptionTier.publicId })
    .from(subscriptionTier)
    .where(eq(subscriptionTier.key, 'max'))
    .limit(1);
  tierInternalId = tier.id;
  tierPublicId = tier.publicId;

  const moduleRef = await Test.createTestingModule({ imports: [PaymentsModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  const failingRef = await Test.createTestingModule({ imports: [PaymentsModule] })
    .overrideProvider(PAYMENT_PORT)
    .useValue(failingAdapter)
    .compile();
  appFailing = failingRef.createNestApplication();
  await appFailing.init();
});

afterAll(async () => {
  await app?.close();
  await appFailing?.close();

  if (createdUserIds.length > 0) {
    await db.delete(paymentEvent).where(inArray(paymentEvent.userId, createdUserIds));
    await db.delete(creditTransaction).where(inArray(creditTransaction.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }

  if (originalMaxTier) {
    await db.update(subscriptionTier).set(originalMaxTier).where(eq(subscriptionTier.key, 'max'));
  } else {
    await db.delete(subscriptionTier).where(eq(subscriptionTier.key, 'max'));
  }
  await pool.end();
});

describe('POST /payments/checkout + GET /payments/verify (T-081, FR-018)', () => {
  it('checkout snapshots the plan price + allowance into a new payment_event(status=initiated)', async () => {
    const user = await makeUser();
    const res = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', bearer(user.publicId))
      .send({ planId: tierPublicId })
      .expect(201);
    expect(typeof res.body.redirectUrl).toBe('string');

    const [event] = await db
      .select()
      .from(paymentEvent)
      .where(eq(paymentEvent.userId, user.id))
      .limit(1);
    expect(event.status).toBe('initiated');
    expect(event.priceSnapshotMinor).toBe(TIER_PRICE_MINOR);
    expect(event.creditAllowanceSnapshot).toBe(TIER_ALLOWANCE);
    expect(event.planId).toBe(tierInternalId);
  });

  it('checkout for an unknown plan returns 404', async () => {
    const user = await makeUser();
    await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', bearer(user.publicId))
      .send({ planId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('checkout requires authentication (401)', async () => {
    await request(app.getHttpServer())
      .post('/payments/checkout')
      .send({ planId: tierPublicId })
      .expect(401);
  });

  it('verify grants credit + sets tier exactly once; a repeat verify for the same Authority is a no-op', async () => {
    const user = await makeUser();
    const checkout = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', bearer(user.publicId))
      .send({ planId: tierPublicId })
      .expect(201);
    const authority = authorityFrom(checkout.body.redirectUrl);

    const verify1 = await request(app.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: authority, Status: 'OK' })
      .expect(200);
    expect(verify1.body.status).toBe('verified');

    const [afterFirst] = await db
      .select({ balance: users.creditBalance, tierId: users.subscriptionTierId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(afterFirst.balance).toBe(TIER_ALLOWANCE);
    expect(afterFirst.tierId).toBe(tierInternalId);

    // Replay: identical Authority again -> idempotent, no double grant.
    const verify2 = await request(app.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: authority, Status: 'OK' })
      .expect(200);
    expect(verify2.body.status).toBe('verified');

    const [afterSecond] = await db
      .select({ balance: users.creditBalance })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(afterSecond.balance).toBe(TIER_ALLOWANCE); // unchanged
  });

  it('verify never trusts a forged Status query param — a real Authority verifies via the adapter regardless of Status=NOK', async () => {
    const user = await makeUser();
    const checkout = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', bearer(user.publicId))
      .send({ planId: tierPublicId })
      .expect(201);
    const authority = authorityFrom(checkout.body.redirectUrl);

    const verify = await request(app.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: authority, Status: 'NOK' }) // client-forged failure flag
      .expect(200);
    expect(verify.body.status).toBe('verified'); // adapter's own verify() ignored Status

    const [row] = await db
      .select({ balance: users.creditBalance })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(row.balance).toBe(TIER_ALLOWANCE);
  });

  it('verify with an unrecognized Authority returns 400', async () => {
    await request(app.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: 'never-issued-authority', Status: 'OK' })
      .expect(400);
  });

  it('verify with no Authority at all returns 400', async () => {
    await request(app.getHttpServer()).get('/payments/verify').expect(400);
  });

  it('an adapter-verified failure marks the payment_event failed and grants no credit', async () => {
    const user = await makeUser();
    const checkout = await request(appFailing.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', bearer(user.publicId))
      .send({ planId: tierPublicId })
      .expect(201);
    const authority = authorityFrom(checkout.body.redirectUrl);

    const verify = await request(appFailing.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: authority, Status: 'OK' }) // even Status=OK is ignored — adapter says failed
      .expect(200);
    expect(verify.body.status).toBe('failed');

    const [row] = await db
      .select({ balance: users.creditBalance, tierId: users.subscriptionTierId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(row.balance).toBe(0);
    expect(row.tierId).toBeNull();

    const [event] = await db
      .select({ status: paymentEvent.status })
      .from(paymentEvent)
      .where(eq(paymentEvent.userId, user.id))
      .limit(1);
    expect(event.status).toBe('failed');

    // Re-verifying an already-failed event returns the stored outcome, without
    // re-invoking the adapter or granting anything.
    const verify2 = await request(appFailing.getHttpServer())
      .get('/payments/verify')
      .query({ Authority: authority })
      .expect(200);
    expect(verify2.body.status).toBe('failed');
  });
});
