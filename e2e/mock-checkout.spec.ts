import {
  API_BASE_URL,
  expect,
  isAiFailurePass,
  isLowConfidencePass,
  loginViaUi,
  registerUserViaApi,
  stubZarinpalRedirect,
  test,
} from './fixtures/ai-and-payment-stubs';

/**
 * Journey 4 (T-190): mock-Zarinpal checkout updates tier/credits, no real
 * transaction (FR-018). `ZarinpalMockAdapter` is in-process (no real
 * network) but its redirect URL (`https://mock-zarinpal.local/pay/:ref`)
 * would still fail a real browser navigation, so `stubZarinpalRedirect`
 * intercepts that ORIGIN (not our app) and bounces the browser on to our
 * own real `/v1/payments/verify` endpoint — the same shape as a genuine
 * gateway redirect-back, faked only at the network layer.
 *
 * Nothing in the current frontend calls `/v1/payments/verify` itself (the
 * `isReturningFromCheckout` route-detection this task's own comments
 * attribute to "T-097" is not wired to any caller yet) — so the browser
 * landing on the raw JSON response (rather than a rendered "activating your
 * subscription" page) is the current, real behavior, not a test artifact.
 */
test.describe('Mock-Zarinpal checkout → tier/credits updated (FR-018)', () => {
  test('selecting a plan redirects through the mock gateway and updates the tier + credit balance', async ({
    page,
    request,
  }) => {
    test.skip(isLowConfidencePass() || isAiFailurePass(), 'requires the default pass');

    const user = await registerUserViaApi(request);
    await loginViaUi(page, user.email, user.password);

    await page.goto('/billing');
    const badge = page.getByTestId('credit-balance-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('رایگان'); // starts on the free tier (no subscription yet)

    await stubZarinpalRedirect(page, 'OK');

    await page.getByTestId('billing-open-upgrade-modal').click();
    const dialog = page.getByRole('dialog', { name: 'ارتقاء اشتراک' });
    await expect(dialog.getByTestId('upgrade-plan-pro')).toBeVisible();

    await dialog
      .getByTestId('upgrade-plan-pro')
      .getByRole('button', { name: 'انتخاب این طرح' })
      .click();

    // Full-page navigation chain: our app → (intercepted) mock-zarinpal.local
    // → our own `/v1/payments/verify` callback, which server-side (never
    // trusting the `Status` query param) grants the plan's credit allowance
    // and sets the tier in one DB transaction (`PaymentsService.verify`).
    await page.waitForURL('**/v1/payments/verify**', { timeout: 15_000 });
    await expect(page.locator('body')).toContainText('verified');

    // Re-fetch the billing page fresh (new query, no stale cache) to confirm
    // the grant actually landed server-side, not just in local state.
    await page.goto('/billing');
    await expect(page.getByTestId('credit-balance-badge')).toContainText('حرفه‌ای', {
      timeout: 10_000,
    }); // pro tier label
    await expect(page.getByTestId('credit-balance-badge')).toContainText('۳۰۰'); // pro's seeded monthly_credit_allowance

    // Cross-check via the API directly for a precise, non-UI-formatted assertion.
    const balanceRes = await request.get(`${API_BASE_URL}/v1/credits/balance`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(balanceRes.ok()).toBeTruthy();
    const balance = (await balanceRes.json()) as { balance: number; tier: string };
    expect(balance.tier).toBe('pro');
    expect(balance.balance).toBe(300);
  });
});
