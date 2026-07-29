import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const test = base;
export { expect };

/**
 * Deterministic fixtures for the T-190 critical-journey E2E suite: API
 * helpers that arrange state the real UI cannot yet reach on its own
 * (documented per-helper below), plus network interception for the
 * mock-Zarinpal checkout redirect. No real OpenAI/Zarinpal network call is
 * ever made — see `playwright.config.ts`'s top comment for the full
 * determinism contract (env knobs + the three-pass `test:e2e` design).
 */

export const API_BASE_URL = `http://localhost:${process.env.E2E_BACKEND_PORT ?? 3001}`;

/** MUST match `backend/src/db/seed.ts`'s `E2E_SEED_SPECIES_ID` (separate runtime/package — duplicated, not imported). */
export const E2E_SEED_SPECIES_ID = 'e2e-seed-species-sansevieria';
/** The seeded species' Persian/scientific names — mirrors `db/seed.ts`'s `seedSpecies()`. */
export const E2E_SEED_SPECIES_SCIENTIFIC_NAME = 'Sansevieria trifasciata';

/** MUST match `backend/src/db/seed.ts`'s admin credentials. */
export const E2E_ADMIN_EMAIL = 'e2e-admin@plantcare.local';
export const E2E_ADMIN_PASSWORD = 'e2e-admin-pass-1';

/**
 * A real 8x8 PNG that `UploadValidationService` can fully decode AND re-encode
 * (it decodes actual bytes via sharp, not the filename/content-type). A 1x1 PNG
 * is NOT safe here: its header parses but the pixel decode/re-encode fails
 * ("libspng read error") in this sharp build, which the service now maps to a
 * 415 — so the scan would be rejected, not identified.
 */
export const TEST_IMAGE_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqdDAihiGlgQAkMctAajizggAAAAASUVORK5CYII=',
  'base64',
);

/** A password satisfying the shared `passwordSchema` (>=8 chars, letter + digit). */
export const TEST_PASSWORD = 'correct-horse-1';

export function randomEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

/** Decodes a JWT's `sub` claim (the user's public_id) without verifying the signature — test-only. */
export function decodePublicIdFromAccessToken(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  const claims = JSON.parse(json) as { sub: string };
  return claims.sub;
}

async function expectOk(
  res: { ok(): boolean; status(): number; text(): Promise<string> },
  label: string,
) {
  if (!res.ok()) {
    throw new Error(`${label} failed: ${res.status()} ${await res.text()}`);
  }
}

export interface RegisteredUser {
  email: string;
  password: string;
  accessToken: string;
  publicId: string;
}

/**
 * `POST /v1/auth/register` via the API directly (not the UI) — used only for
 * journeys whose focus is NOT the registration form itself (credit
 * exhaustion, AI-failure/refund), so those specs don't re-test registration.
 * The guest-limit journey registers through the real UI instead, since that
 * flow IS the thing under test there.
 */
export async function registerUserViaApi(
  request: APIRequestContext,
  password: string = TEST_PASSWORD,
): Promise<RegisteredUser> {
  const email = randomEmail();
  const res = await request.post(`${API_BASE_URL}/v1/auth/register`, { data: { email, password } });
  await expectOk(res, 'register');
  const body = (await res.json()) as { accessToken: string };
  return {
    email,
    password,
    accessToken: body.accessToken,
    publicId: decodePublicIdFromAccessToken(body.accessToken),
  };
}

/** `POST /v1/auth/login` for the seeded admin account (see `db/seed.ts`). */
export async function adminLoginViaApi(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE_URL}/v1/auth/login`, {
    data: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
  });
  await expectOk(res, 'admin login (has `npm run db:seed` been run against this stack?)');
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/**
 * `PATCH /v1/admin/users/:publicId` — grants credit and/or sets tier via the
 * real admin endpoint (audited server-side; not a DB bypass). Used to arrange
 * the exact credit/tier state the credit-exhaustion and AI-failure journeys
 * need, since a freshly-registered user starts at 0 credit / free tier and
 * the current UI has no path to change either.
 */
export async function grantCreditAndTier(
  request: APIRequestContext,
  adminAccessToken: string,
  targetPublicId: string,
  patch: { creditAdjustment?: number; tier?: 'free' | 'pro' | 'max' },
): Promise<void> {
  const res = await request.patch(`${API_BASE_URL}/v1/admin/users/${targetPublicId}`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` },
    data: { ...patch, reason: 'T-190 e2e fixture setup' },
  });
  await expectOk(res, 'admin credit/tier grant');
}

export interface ResolvedScan {
  id: string;
  status: 'completed' | 'failed';
  species: unknown;
  lowConfidence: boolean;
  message: string | null;
}

/**
 * `POST /v1/scans` + poll `GET /v1/scans/:id` to a terminal status, via the
 * API with a bearer token — driven directly rather than through
 * `PhotoUploader`/`ScanFlow` because those currently never attach an
 * `Authorization` header (guest-only wiring today — see the T-190 completion
 * report), so an authenticated identify scan is unreachable via the real UI
 * at all. Needed only as SETUP for the credit-exhaustion/AI-failure journeys
 * (which need a saved plant to reach the chat feature) — `scan-identify.spec.ts`
 * itself exercises the real guest-facing UI path end-to-end.
 */
export async function submitAuthenticatedIdentifyScanViaApi(
  request: APIRequestContext,
  accessToken: string,
): Promise<ResolvedScan> {
  const res = await request.post(`${API_BASE_URL}/v1/scans`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': `e2e-identify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    multipart: { photo: { name: 'leaf.png', mimeType: 'image/png', buffer: TEST_IMAGE_BUFFER } },
  });
  await expectOk(res, 'authenticated scan submit');
  const job = (await res.json()) as { id: string };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const poll = await request.get(`${API_BASE_URL}/v1/scans/${job.id}`);
    const polled = (await poll.json()) as ResolvedScan & { status: string };
    if (polled.status === 'completed' || polled.status === 'failed') {
      return polled as ResolvedScan;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`scan ${job.id} did not resolve within the polling budget`);
}

/** `POST /v1/plants` — saves a completed, successful (species-matched) scan as a plant. */
export async function savePlantFromScanViaApi(
  request: APIRequestContext,
  accessToken: string,
  scanPublicId: string,
): Promise<{ id: string }> {
  const res = await request.post(`${API_BASE_URL}/v1/plants`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { scanPublicId },
  });
  await expectOk(res, 'save plant from scan');
  return (await res.json()) as { id: string };
}

/**
 * End-to-end setup helper: registers a user, grants them just enough credit
 * for one identify scan (+1) and (optionally) sets their tier, runs an
 * authenticated identify scan matched against the seeded species (via
 * `STUB_AI_SPECIES_ID`), and saves it as a plant. Returns everything the
 * credit-exhaustion / AI-failure specs need to log in as this user in the
 * browser and open its plant detail page.
 */
export async function arrangeUserWithSavedPlant(
  request: APIRequestContext,
  opts: { tier?: 'free' | 'pro' | 'max'; creditsAfterSetup?: number } = {},
): Promise<{ user: RegisteredUser; plantId: string }> {
  const user = await registerUserViaApi(request);
  const adminToken = await adminLoginViaApi(request);

  // Grant exactly 1 credit (the seeded `credit_costs.identify` cost) so the
  // authenticated scan below succeeds, and set the tier now if requested —
  // consumed by that one scan, so the balance is back to 0 immediately after.
  await grantCreditAndTier(request, adminToken, user.publicId, {
    creditAdjustment: 1,
    tier: opts.tier,
  });

  const scan = await submitAuthenticatedIdentifyScanViaApi(request, user.accessToken);
  if (scan.status !== 'completed' || scan.species === null) {
    throw new Error(
      `fixture setup expected a confident, catalog-matched identify scan — got status=${scan.status} species=${JSON.stringify(scan.species)}. Is STUB_AI_SPECIES_ID set to E2E_SEED_SPECIES_ID and is that species row seeded?`,
    );
  }
  const plant = await savePlantFromScanViaApi(request, user.accessToken, scan.id);

  // Optional top-up AFTER the setup scan has already consumed its 1 credit —
  // gives the caller a known, nonzero starting balance (e.g. the
  // AI-failure-refund journey needs a debit-then-refund cycle to be
  // observable, not just "still 0").
  if (opts.creditsAfterSetup !== undefined) {
    await grantCreditAndTier(request, adminToken, user.publicId, {
      creditAdjustment: opts.creditsAfterSetup,
    });
  }

  return { user, plantId: plant.id };
}

/**
 * Logs the browser session in by calling `useAuthStore.setSession` equivalent
 * via the real login form (`/login` page) — so the resulting session is a
 * genuine product of the UI login flow, not an injected token.
 */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('ایمیل').fill(email);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  // The login page redirects home once a session exists (mirrors register/page.tsx's pattern).
  await page.waitForURL('**/');
}

/**
 * Intercepts the fake `mock-zarinpal.local` origin — `ZarinpalMockAdapter`'s
 * redirect target (`payments/adapters/zarinpal-mock.adapter.ts`), never a
 * real network call — and serves a tiny page that immediately navigates the
 * browser on to OUR backend's real `/v1/payments/verify` callback with the
 * `Authority` extracted from the intercepted URL. This is what a real
 * gateway's redirect-back looks like, faked only at the network layer.
 */
export async function stubZarinpalRedirect(page: Page, status: 'OK' | 'NOK' = 'OK'): Promise<void> {
  await page.route('https://mock-zarinpal.local/**', async (route) => {
    const url = new URL(route.request().url());
    const providerRef = url.pathname.split('/').filter(Boolean).pop() ?? '';
    const verifyUrl = `${API_BASE_URL}/v1/payments/verify?Authority=${encodeURIComponent(providerRef)}&Status=${status}`;
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta http-equiv="refresh" content="0; url=${verifyUrl}"></head></html>`,
    });
  });
}

/** True when the running backend was booted with a sub-70% confidence override (see `playwright.config.ts`). */
export function isLowConfidencePass(): boolean {
  return Number(process.env.STUB_AI_CONFIDENCE ?? 0.92) < 0.7;
}

/** True when the running backend was booted with AI-failure injection enabled (see `playwright.config.ts`). */
export function isAiFailurePass(): boolean {
  return process.env.STUB_AI_FAIL === '1';
}

/** Uploads `TEST_IMAGE_BUFFER` into the real `PhotoUploader` and submits it — drives the actual guest-facing UI. */
export async function uploadTestPhotoAndSubmit(page: Page): Promise<void> {
  await page
    .getByTestId('photo-uploader')
    .getByLabel('انتخاب از گالری')
    .setInputFiles({ name: 'leaf.png', mimeType: 'image/png', buffer: TEST_IMAGE_BUFFER });
  await page.getByRole('button', { name: 'شناسایی گیاه' }).click();
}
