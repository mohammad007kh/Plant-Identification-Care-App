import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (T-190). Specs live under `e2e/`.
 *
 * Determinism: the backend's AI provider is the deterministic
 * `StubPlantAIProvider` (backend/src/ai-gateway/stub-plant-ai.provider.ts)
 * whenever `OPENAI_API_KEY` is unset — true for every E2E run below, since
 * `webServer.env` never sets it. Its behavior is controlled by env vars this
 * config passes through from the invoking shell:
 *
 *   STUB_AI_CONFIDENCE   number, default 0.92 — set <0.70 to exercise the
 *                        low-confidence journey (see `npm run test:e2e:low-confidence`).
 *   STUB_AI_SPECIES_ID   string — returned as the identify result's speciesId
 *                        so a confident scan can resolve against the fixed
 *                        `species` row `db/seed.ts` seeds (needed to save a
 *                        plant, which the credit-exhaustion/AI-failure
 *                        journeys need to reach the per-plant chat feature).
 *   STUB_AI_FAIL         '1' to force a thrown error from the stub.
 *   STUB_AI_FAIL_ACTION  'identify'|'chat'|'compare'|'all' (default 'all') —
 *                        scopes which method fails (see `npm run test:e2e:ai-failure`).
 *
 * Because these are boot-time env vars (fixed for one server process), a
 * single `webServer` pass cannot exercise the confidence AND the AI-failure
 * branch simultaneously — `package.json`'s `test:e2e` runs three passes
 * (default / low-confidence / ai-failure), each restarting the backend with
 * the right env and `--grep`-selecting only the test(s) that need it. Tests
 * that don't apply to a given pass self-skip via the same env var
 * (`test.skip(...)`), so running any single pass directly is also safe.
 *
 * Payments: `ZarinpalMockAdapter` (in-process, no real network) redirects to
 * a fake `https://mock-zarinpal.local/pay/:ref` URL; `e2e/fixtures/
 * ai-and-payment-stubs.ts` intercepts that origin via `page.route` so no real
 * DNS/network call is ever attempted.
 */
const PORT = Number(process.env.E2E_FRONTEND_PORT ?? 23100);
const API_PORT = Number(process.env.E2E_BACKEND_PORT ?? 23101);
const BASE_URL = `http://localhost:${PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;

// Mirrors `backend/src/db/seed.ts`'s `E2E_SEED_SPECIES_ID` and
// `e2e/fixtures/ai-and-payment-stubs.ts`'s constant of the same name — kept a
// fixed default here so every npm `test:e2e:*` script gets it "for free"
// without repeating it in each script.
const DEFAULT_STUB_AI_SPECIES_ID = 'e2e-seed-species-sansevieria';

/** Env forwarded to the spawned backend — keeps AI/payment stubbing config explicit and visible here. */
const backendEnv = {
  ...process.env,
  PORT: String(API_PORT),
  CORS_ORIGIN: BASE_URL,
  // Backing services: default to the docker-compose hosts (same defaults as
  // backend/src/db/client.ts) so the suite is self-contained — `docker compose
  // up` + `npm run db:seed` is all it needs. There is no committed root `.env`;
  // NestJS's AppConfigModule hard-requires these in process.env (fail-fast), so
  // they MUST be set here rather than assumed present.
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:25432/plant',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:26379',
  // JWT secrets are hard-required by token.service.ts (throws if unset). E2E-only
  // dev values — never used outside the local Playwright-spawned backend.
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret',
  OPENAI_API_KEY: '', // never real OpenAI — forces StubPlantAIProvider (ai-gateway.module.ts)
  PAYMENT_PROVIDER: 'zarinpal_mock',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  STUB_AI_SPECIES_ID: process.env.STUB_AI_SPECIES_ID ?? DEFAULT_STUB_AI_SPECIES_ID,
};

const frontendEnv = {
  ...process.env,
  PORT: String(PORT),
  NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
};

export default defineConfig({
  testDir: './e2e',
  // Re-seed the DB before any spec so the suite is immune to app_config
  // pollution from the backend integration tests (which drop
  // allowed_photo_file_types to ["image/jpeg"]) — see e2e/global-setup.ts.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // journeys share seeded/global state (tiers, admin, species) — avoid cross-test races
  workers: 1, // serialize across spec files too — journeys share global DB state; fullyParallel:false alone does not serialize between files
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  use: {
    baseURL: BASE_URL,
    locale: 'fa-IR',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Skipped entirely when E2E_SKIP_WEBSERVER=1 (CI/dev setups that already
  // have the stack running against the same ports — Playwright reuses an
  // already-listening server automatically via `reuseExistingServer`).
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          // NOT `tsx`: esbuild's decorator-metadata emission breaks NestJS's
          // constructor-based DI here (confirmed while authoring this task —
          // `AuthService`'s first param resolves `undefined` at runtime under
          // tsx/esbuild, regardless of `useDefineForClassFields`). `ts-node`
          // uses the real TypeScript compiler (correct decorator metadata)
          // AND goes through Node's classic CJS `require()` resolution
          // (unlike a plain `node dist/main.js`, which — on Node 22, via its
          // native TS/ESM auto-detection — fails resolving the `shared`
          // workspace package's directory-style barrel exports). `-T`
          // (transpileOnly) skips type-checking here; that's already covered
          // by `backend`'s own `npm run typecheck`.
          command: 'npx ts-node -T src/main.ts',
          cwd: './backend',
          port: API_PORT,
          env: backendEnv,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: 'npx next dev -p ' + PORT,
          cwd: './frontend',
          port: PORT,
          env: frontendEnv,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});
