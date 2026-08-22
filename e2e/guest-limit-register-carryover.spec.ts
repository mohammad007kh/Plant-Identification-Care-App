import {
  API_BASE_URL,
  expect,
  isAiFailurePass,
  isLowConfidencePass,
  randomEmail,
  TEST_PASSWORD,
  test,
  uploadTestPhotoAndSubmit,
} from './fixtures/ai-and-payment-stubs';

/**
 * Journey 2 (T-190): the 2-scan guest limit → registration wall → register →
 * prior guest scans carried over (FR-006, FR-008). Uses a fresh browser
 * context (Playwright gives every test its own) so the guest identity starts
 * clean — the server-authoritative `guest-id` httpOnly cookie is set on the
 * FIRST scan and persists across the `page.goto('/')` reloads below (the
 * cookie jar belongs to the browser context, not the page).
 */
test.describe('Guest 2-scan limit → registration wall → register → carryover (FR-006, FR-008)', () => {
  test('blocks the 3rd guest scan, and registering from the wall carries prior guest scans into the new account', async ({
    page,
    request,
  }) => {
    test.skip(isLowConfidencePass() || isAiFailurePass(), 'requires the default pass');

    const guestScanPublicIds: string[] = [];

    /**
     * `ScanResult`'s confident-result view has no "scan again" affordance
     * (only the low-confidence/failed views do) — a fresh `page.goto('/')`
     * is the realistic way a guest reaches the uploader again (e.g. a
     * refresh), and it does NOT reset the server-side scan count, which is
     * exactly the server-authoritative behavior FR-006 requires.
     */
    async function submitOneGuestScan(): Promise<void> {
      await page.goto('/');
      await expect(page.getByTestId('photo-uploader')).toBeVisible();

      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().endsWith('/v1/scans') && res.request().method() === 'POST',
        ),
        uploadTestPhotoAndSubmit(page),
      ]);
      const body = (await response.json()) as { id: string };
      guestScanPublicIds.push(body.id);

      await expect(
        page.getByTestId('scan-result').or(page.getByTestId('scan-low-confidence-prompt')),
      ).toBeVisible({ timeout: 20_000 });
    }

    await submitOneGuestScan(); // guest scan #1 of 2 free
    await submitOneGuestScan(); // guest scan #2 of 2 free

    // 3rd attempt: server-authoritative 403 (GuestScanLimitExceededException) →
    // the registration wall replaces the uploader entirely (never alongside it).
    await page.goto('/');
    await uploadTestPhotoAndSubmit(page);

    await expect(page.getByTestId('registration-wall')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('photo-dropzone')).toHaveCount(0);
    // FR-007/008: the wall replaces the error UI, never alongside it — so no
    // scan-error alert should show. Scope to NON-EMPTY alerts: `next dev` mounts
    // an always-present empty `role=alert` live region (the Next.js dev-tools
    // overlay) that a bare `getByRole('alert')` would falsely catch.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);

    const email = randomEmail('carryover');
    const [registerResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/v1/auth/register') && res.request().method() === 'POST',
      ),
      (async () => {
        await page.getByLabel('ایمیل').fill(email);
        await page.getByLabel('رمز عبور').fill(TEST_PASSWORD);
        await page.getByRole('button', { name: 'ثبت‌نام' }).click();
      })(),
    ]);
    const { accessToken } = (await registerResponse.json()) as { accessToken: string };

    // UI confirmation (FR-008): the wall swaps to the restored-scans banner —
    // not a generic welcome/redirect — and the register form is gone.
    await expect(page.getByTestId('guest-scans-restored-banner')).toBeVisible();
    await expect(page.getByTestId('register-form')).toHaveCount(0);

    // Behavioral proof the merge actually re-parented the guest's scans —
    // not just that the banner rendered. `useRegister`'s `onSuccess` sets
    // `justConvertedFromGuest: true` unconditionally on any successful
    // registration (see `features/auth/hooks/use-register.ts`), so the banner
    // alone would render identically even if `GuestMergeService` silently
    // did nothing. Saving the FIRST guest scan as a plant under the new
    // account only succeeds if `PlantsService.saveFromScan`'s ownership check
    // (`findOwnedScanByPublicId(userId, ...)`) now finds it — i.e. only if
    // `scan.user_id` was actually re-parented from the guest session.
    const saveRes = await request.post(`${API_BASE_URL}/v1/plants`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { scanPublicId: guestScanPublicIds[0] },
    });
    expect(
      saveRes.ok(),
      `expected guest scan #1 (${guestScanPublicIds[0]}) to be re-parented and savable by the new account; ` +
        `got ${saveRes.status()} ${await saveRes.text()}`,
    ).toBeTruthy();
  });
});
