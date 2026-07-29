process.env.DISABLE_WORKERS = '1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:15432/plant';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { analyticsEvent, users } from '../src/db/schema';
import { AnalyticsModule } from '../src/analytics/analytics.module';
import { AnalyticsService } from '../src/analytics/analytics.service';

// Unique-per-run marker so this suite never collides with rows written by
// other suites (e.g. admin-users.e2e.spec.ts also writes to analytics_event)
// or by a concurrent test run, and cleanup only ever touches its own rows.
const RUN_MARKER = `t160-${Date.now()}-${Math.random().toString(36).slice(2)}`;

let app: INestApplication;
let analytics: AnalyticsService;
const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const email = `analytics-e2e-${RUN_MARKER}-${createdUserIds.length}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', role: 'user' })
    .returning({ id: users.id });
  createdUserIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AnalyticsModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  analytics = app.get(AnalyticsService);
});

afterAll(async () => {
  await app?.close();
  // jsonb containment (`->>`), NOT `eq(analyticsEvent.props, ...)` — the latter
  // requires exact whole-document equality and would miss rows whose props
  // also carry other keys (confidence, source, amount, ...) alongside the marker.
  await db
    .delete(analyticsEvent)
    .where(sql`${analyticsEvent.props} ->> 'runMarker' = ${RUN_MARKER}`);
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await pool.end();
});

describe('AnalyticsService (T-160, FR-028) — real Postgres round trip', () => {
  it('persists an authenticated event: user_id set, props minimized, UTC timestamp assigned', async () => {
    const userId = await makeUser();

    await analytics.track('scan.succeeded', {
      userId,
      confidence: 0.87,
      lowConfidence: false,
      runMarker: RUN_MARKER,
    });

    const [row] = await db
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.userId, userId))
      .limit(1);

    expect(row).toBeTruthy();
    expect(row.name).toBe('scan.succeeded');
    expect(row.props).toMatchObject({ confidence: 0.87, lowConfidence: false });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('persists a guest-attributed event with a null user_id', async () => {
    await analytics.track('scan.attempted', { runMarker: RUN_MARKER, source: 'guest' });

    const rows = await db
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.name, 'scan.attempted'));
    const row = rows.find(
      (r) => r.userId === null && (r.props as Record<string, unknown>)?.runMarker === RUN_MARKER,
    );

    expect(row).toBeTruthy();
    expect(row?.props).toMatchObject({ source: 'guest' });
  });

  it('a forced persistence failure never throws and never breaks the caller (non-blocking, FR-028)', async () => {
    // No real user with this id — the FK constraint on user_id makes the
    // insert fail, exercising the actual failure path end-to-end (not a mock).
    await expect(
      analytics.track('credit.consumed', {
        userId: 'nonexistent-user-id',
        amount: 2,
        runMarker: RUN_MARKER,
      }),
    ).resolves.toBeUndefined();

    const rows = await db
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.name, 'credit.consumed'));
    const persisted = rows.find(
      (r) => (r.props as Record<string, unknown>)?.runMarker === RUN_MARKER,
    );
    expect(persisted).toBeUndefined();
  });

  it('never persists an event whose props contain an obviously-PII key', async () => {
    const userId = await makeUser();

    await analytics.track('registration.converted', {
      userId,
      email: 'leaked@example.com',
      runMarker: RUN_MARKER,
    } as never);

    const [row] = await db
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.name, 'registration.converted'))
      .limit(1);

    expect(row).toBeUndefined();
  });
});
