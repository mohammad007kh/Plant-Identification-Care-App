import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Playwright global setup (T-190). Re-seeds the database once, before any spec
 * runs, so the E2E suite is immune to DB pollution left by OTHER tooling that
 * shares the same stack — specifically the backend integration suite, whose
 * admin-config specs mutate `app_config.allowed_photo_file_types` down to
 * `["image/jpeg"]` and never restore it. Running `npm run db:seed` here restores
 * the full allowlist (`image/jpeg`, `image/png`, `image/webp`) plus the tiers /
 * admin / species / credit-costs rows every journey relies on.
 *
 * The seed talks to Postgres directly (not through the backend), so it does not
 * depend on the Playwright-spawned web servers being up yet — it only needs the
 * docker-compose Postgres to be reachable, which is a documented prerequisite
 * (`docker compose up`). It is idempotent (upserts), so re-running it is safe.
 */
export default function globalSetup(): void {
  const backendDir = path.resolve(__dirname, '..', 'backend');

  console.log('[e2e:global-setup] re-seeding database (npm run db:seed)…');
  execSync('npm run db:seed', {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  });
}
