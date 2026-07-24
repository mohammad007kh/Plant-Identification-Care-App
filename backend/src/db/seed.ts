/**
 * Database seed script — deterministic local dev/test data.
 *
 * STRUCTURAL SKELETON (T-004): the schema tables this seeds land in later tasks
 * (T-010 users/species, T-011 subscription_tier, T-012 app_config). Each function
 * below documents exactly what it will upsert, idempotently by natural key, once
 * those schemas exist. Wiring the real Drizzle calls is done in T-013 (which owns
 * the config service) and the schema tasks — this file's shape is stable so it
 * compiles and runs (as a logged no-op) today.
 *
 * Run: `npm run db:seed` (backend workspace) → `tsx src/db/seed.ts`
 */

/** free/pro/max tiers with placeholder monthly allowances + prices (IRR minor units). */
async function seedTiers(): Promise<void> {
  // TODO(T-011): upsert subscription_tier rows ON CONFLICT (key) DO UPDATE:
  //   free → allowance 30,   price 0
  //   pro  → allowance 300,  price <set at launch>
  //   max  → allowance 1500, price <set at launch>
  console.log('[seed] tiers: pending T-011 (subscription_tier table)');
}

/** one demo admin account (role=admin) for local admin-panel testing. */
async function seedAdmin(): Promise<void> {
  // TODO(T-010): upsert user { email: 'admin@plantcare.local', role: 'admin',
  //   password_hash: <argon2 of a dev password> } ON CONFLICT (email) DO NOTHING.
  console.log('[seed] admin: pending T-010 (user table)');
}

/** a handful of common houseplants with minimal care_guide jsonb. */
async function seedSpecies(): Promise<void> {
  // TODO(T-010): insert 3-5 species rows (e.g. Pothos, Snake Plant, Monstera,
  //   Peace Lily) each with a minimal care_guide { watering, light, soil }.
  console.log('[seed] species: pending T-010 (species table)');
}

/** operational config defaults: allowed photo types + per-action credit costs. */
async function seedAppConfig(): Promise<void> {
  // TODO(T-012/T-013): upsert app_config keys:
  //   allowed_image_types → ['image/jpeg','image/png','image/webp']
  //   credit_cost         → { identify: 1, chat: 1, comparison: 1 }
  console.log('[seed] app_config: pending T-012/T-013 (app_config table)');
}

async function main(): Promise<void> {
  console.log('[seed] starting…');
  await seedTiers();
  await seedAdmin();
  await seedSpecies();
  await seedAppConfig();
  console.log('[seed] done (skeleton — schema-backed inserts land with T-010..T-013).');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
