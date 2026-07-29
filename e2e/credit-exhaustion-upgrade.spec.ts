import {
  arrangeUserWithSavedPlant,
  expect,
  isAiFailurePass,
  isLowConfidencePass,
  loginViaUi,
  test,
} from './fixtures/ai-and-payment-stubs';

/**
 * Journey 3 (T-190): credit exhaustion → 402 → upgrade modal lists live plans
 * (FR-013, FR-016). Reached through the per-plant AI chat feature
 * (`features/chat`), not scan submission — `useChat`'s `onError` is the only
 * place in the current app that reacts to a 402 by opening the shared
 * `UpgradeModal`; `ScanFlow`/`use-create-scan.ts` has no such handling (a 402
 * there would just render a generic error message). See the completion
 * report for this and the other UI-wiring gaps this task surfaced.
 *
 * Fixture setup (`arrangeUserWithSavedPlant`) drives real backend endpoints
 * directly (register, admin credit/tier grant, authenticated scan, save
 * plant) rather than through the UI: today's UI has no way to (a) submit an
 * AUTHENTICATED scan at all (`scans-api.ts` never attaches an Authorization
 * header — every UI-driven scan is a guest scan, logged in or not) or
 * (b) save a scan result as a plant (no such button exists in `ScanResult`).
 * Both are real, currently-unreachable-via-UI gaps this task's investigation
 * surfaced; the test below drives the real UI for the actual behavior under
 * test (opening chat, sending a message, observing the 402 → modal).
 */
test.describe('Credit exhaustion → 402 → upgrade modal (FR-013, FR-016)', () => {
  test('a metered chat send with 0 credit opens the upgrade modal listing the live plan catalog', async ({
    page,
    request,
  }) => {
    test.skip(isLowConfidencePass() || isAiFailurePass(), 'requires the default pass');

    // Pro tier meters every chat message from the very first one (no 10-message
    // free-tier cap to burn through first); the setup scan consumes the only
    // credit granted, so the balance is already 0 by the time chat is tried.
    const { user, plantId } = await arrangeUserWithSavedPlant(request, { tier: 'pro' });

    await loginViaUi(page, user.email, user.password);
    await page.goto(`/plants/${plantId}`);
    await expect(page.getByTestId('plant-detail')).toBeVisible();

    await page.getByTestId('chat-entry-button').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();

    await page
      .getByPlaceholder('پیام خود را درباره این گیاه بنویسید...')
      .fill('برگ‌های گیاهم زرد شده‌اند، چه کار کنم؟');
    await page.getByRole('button', { name: 'ارسال' }).click();

    // Metered chat send reserves credit SYNCHRONOUSLY in the POST handler
    // (`ChatService.sendMessage` → `CreditsService.reserve`) — the 402 (and
    // the modal it opens) does not require waiting on the async reply job.
    const dialog = page.getByRole('dialog', { name: 'ارتقاء اشتراک' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByTestId('upgrade-modal-plans')).toBeVisible();

    // "lists live plans": the real seeded `subscription_tier` catalog, never
    // a hardcoded/fallback list (`UpgradeModal`'s own domain rule).
    await expect(dialog.getByTestId('upgrade-plan-free')).toBeVisible();
    await expect(dialog.getByTestId('upgrade-plan-pro')).toBeVisible();
    await expect(dialog.getByTestId('upgrade-plan-max')).toBeVisible();
  });
});
