/**
 * Database seed script — deterministic local dev/test data.
 *
 * Idempotent by natural key (upsert `ON CONFLICT`), so re-running is always
 * safe. Run: `npm run db:seed` (backend workspace) → `tsx src/db/seed.ts`.
 *
 * This backs both local dev bring-up AND the T-190 Playwright E2E suite —
 * `E2E_SEED_SPECIES_ID` below MUST match the constant of the same name in
 * `e2e/fixtures/ai-and-payment-stubs.ts` (duplicated rather than imported:
 * `backend` and the root `e2e/` folder are different packages/runtimes).
 */
import { Algorithm, hash } from '@node-rs/argon2';
import { db, pool } from './client';
import { appConfig, species, subscriptionTier, users } from './schema';

/** Mirrors `e2e/fixtures/ai-and-payment-stubs.ts`'s `E2E_SEED_SPECIES_ID`. */
const E2E_SEED_SPECIES_ID = 'e2e-seed-species-sansevieria';

const E2E_ADMIN_EMAIL = 'e2e-admin@plantcare.local';
// Local/E2E-only credential — never used outside docker-compose dev/test.
const E2E_ADMIN_PASSWORD = 'e2e-admin-pass-1';

/** free/pro/max tiers with placeholder monthly allowances + prices (IRR minor units). */
async function seedTiers(): Promise<void> {
  const rows = [
    { key: 'free' as const, monthlyCreditAllowance: 30, priceMinor: 0 },
    { key: 'pro' as const, monthlyCreditAllowance: 300, priceMinor: 49000 },
    { key: 'max' as const, monthlyCreditAllowance: 1500, priceMinor: 199000 },
  ];

  for (const row of rows) {
    await db
      .insert(subscriptionTier)
      .values({ ...row, currency: 'IRR', active: true })
      .onConflictDoUpdate({
        target: subscriptionTier.key,
        set: {
          monthlyCreditAllowance: row.monthlyCreditAllowance,
          priceMinor: row.priceMinor,
          active: true,
          updatedAt: new Date(),
        },
      });
  }
  console.log('[seed] tiers: free/pro/max upserted.');
}

/** One demo admin account (role=admin) for local admin-panel testing AND the E2E credit-exhaustion fixture. */
async function seedAdmin(): Promise<void> {
  const passwordHash = await hash(E2E_ADMIN_PASSWORD, { algorithm: Algorithm.Argon2id });
  await db
    .insert(users)
    .values({ email: E2E_ADMIN_EMAIL, passwordHash, role: 'admin' })
    .onConflictDoNothing({ target: users.email });
  console.log(`[seed] admin: ensured (${E2E_ADMIN_EMAIL}).`);
}

/**
 * A fixed-id species row the E2E suite's stub AI can deterministically match
 * (`STUB_AI_SPECIES_ID` env var, see `stub-plant-ai.provider.ts`) — without a
 * catalog match, `IdentifyService` never sets `scan.species_id`, and
 * `PlantsService.saveFromScan` requires exactly that to save a plant.
 */
async function seedSpecies(): Promise<void> {
  await db
    .insert(species)
    .values({
      id: E2E_SEED_SPECIES_ID,
      scientificName: 'Sansevieria trifasciata',
      commonNameFa: 'سانسوریا',
      careGuide: {
        watering: 'هر ۲ هفته یک‌بار',
        light: 'نور غیرمستقیم',
        soil: 'خاک زهکش‌دار',
        humidity: 'متوسط',
        temperature: '۱۸ تا ۲۷ درجه',
      },
    })
    .onConflictDoNothing({ target: species.id });
  console.log('[seed] species: seeded fixed E2E-matchable row + none other (skeleton scope).');
}

/** Operational config defaults: allowed photo types, per-action credit costs, notification templates. */
async function seedAppConfig(): Promise<void> {
  const rows: Array<{ key: string; value: unknown }> = [
    {
      key: 'allowed_photo_file_types',
      value: ['image/jpeg', 'image/png', 'image/webp'],
    },
    {
      key: 'credit_costs',
      value: { identify: 1, chat: 1, comparison: 1 },
    },
    {
      key: 'notification_config',
      value: {
        templates: {
          watering: {
            subject: 'زمان آبیاری گیاه شما رسیده است',
            bodyFa: 'یادآوری: طبق راهنمای نگهداری، امروز زمان آبیاری گیاه شماست.',
          },
          custom: {
            subject: 'یادآوری مراقبت از گیاه',
            bodyFa: 'یادآوری سفارشی برای مراقبت از گیاه شما.',
          },
        },
        sendHourLocalTehran: 9,
      },
    },
  ];

  for (const row of rows) {
    await db
      .insert(appConfig)
      .values({ key: row.key, value: row.value, updatedBy: null })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value: row.value, updatedAt: new Date() },
      });
  }
  console.log(
    '[seed] app_config: allowed_photo_file_types + credit_costs + notification_config upserted.',
  );
}

async function main(): Promise<void> {
  console.log('[seed] starting…');
  await seedTiers();
  await seedAdmin();
  await seedSpecies();
  await seedAppConfig();
  console.log('[seed] done.');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
