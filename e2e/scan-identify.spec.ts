import {
  E2E_SEED_SPECIES_SCIENTIFIC_NAME,
  expect,
  isAiFailurePass,
  isLowConfidencePass,
  test,
  uploadTestPhotoAndSubmit,
} from './fixtures/ai-and-payment-stubs';

/**
 * Journey 1 (T-190): guest scan → identify result, both branches of the 70%
 * confidence gate (FR-001, FR-003). Fully guest — no auth, no fixture setup
 * beyond the seeded stack (tiers/app_config/species from `db/seed.ts`).
 *
 * The low-confidence branch needs the backend booted with
 * `STUB_AI_CONFIDENCE < 0.70` (a boot-time env var — see `playwright.config.ts`'s
 * top comment), so it runs in a separate pass (`npm run test:e2e:low-confidence`)
 * and self-skips otherwise; the confident-result test runs in the default pass
 * and self-skips during that separate low-confidence boot.
 */
test.describe('Guest scan → identify result (FR-001, FR-003)', () => {
  test('shows species + structured care guide for a confident (>=70%) identification', async ({
    page,
  }) => {
    test.skip(
      isLowConfidencePass() || isAiFailurePass(),
      'requires the default pass (npm run test:e2e:default) — see playwright.config.ts',
    );

    await page.goto('/');
    await expect(page.getByTestId('photo-uploader')).toBeVisible();

    await uploadTestPhotoAndSubmit(page);

    // The scan is processed async (pending → completed by IdentifyWorker); the
    // progress state is transient/racy under a fast local stub, so only the
    // terminal result is asserted.
    const result = page.getByTestId('scan-result');
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('scan-low-confidence-prompt')).toHaveCount(0);

    // `commonNameFa` (backend) vs `commonName` (frontend's `ScanResult` field
    // read) mismatch means the Persian common name never reaches the UI today
    // (see T-190's completion report) — the title falls back to the
    // scientific name, which IS wired correctly end-to-end.
    await expect(
      result.getByRole('heading', { name: E2E_SEED_SPECIES_SCIENTIFIC_NAME }),
    ).toBeVisible();

    // `StubPlantAIProvider.identify()`'s literal (English) careGuide values —
    // deterministic stub data, not a placeholder.
    await expect(result).toContainText('آبیاری');
    await expect(result).toContainText('weekly');
    await expect(result).toContainText('نور');
    await expect(result).toContainText('bright indirect');
  });

  test('shows the low-confidence prompt — never a species result — below the 70% gate @lowconf', async ({
    page,
  }) => {
    test.skip(
      !isLowConfidencePass(),
      'run with `npm run test:e2e:low-confidence` (boots the backend with STUB_AI_CONFIDENCE<0.70)',
    );

    await page.goto('/');
    await expect(page.getByTestId('photo-uploader')).toBeVisible();

    await uploadTestPhotoAndSubmit(page);

    const prompt = page.getByTestId('scan-low-confidence-prompt');
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    // `IdentifyService`'s own Persian copy for the low-confidence branch — the
    // frontend's local fallback message would be a different, generic string.
    await expect(prompt).toContainText('اطمینان کافی برای شناسایی');

    // Confident-result markup must be entirely absent, not merely hidden.
    await expect(page.getByTestId('scan-result')).toHaveCount(0);
  });
});
