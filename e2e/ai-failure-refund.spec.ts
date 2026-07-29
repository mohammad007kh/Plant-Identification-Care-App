import {
  API_BASE_URL,
  arrangeUserWithSavedPlant,
  expect,
  isAiFailurePass,
  loginViaUi,
  test,
} from './fixtures/ai-and-payment-stubs';

/**
 * Journey 5 (T-190): AI-failure → refund → balance unchanged (FR-017).
 * Exercised via the per-plant chat feature: `StubPlantAIProvider.chat()`
 * throws when this pass boots the backend with `STUB_AI_FAIL=1` and
 * `STUB_AI_FAIL_ACTION=chat` (see `playwright.config.ts`'s top comment) —
 * `STUB_AI_FAIL_ACTION=chat` scopes the failure to `chat()` only, so the
 * fixture's own setup scan (`identify()`) still succeeds in the SAME server
 * boot.
 *
 * A chat send is async end-to-end from the caller's perspective: the POST
 * itself (202) only persists the user's message; the AI call — and the
 * refund-on-failure — happen in `ChatService.processJob` (the worker).
 * There is no distinct "send failed" UI for this path (unlike the guest-limit
 * 403 or the credit-exhaustion 402): `processJob` always inserts an assistant
 * reply row, success or failure, so the failure surfaces as an ordinary chat
 * bubble carrying `ChatService`'s own Persian failure copy.
 */
test.describe('AI-failure refund → balance unchanged (FR-017) @aifail', () => {
  test('a chat send that fails at the AI call refunds the reserved credit, leaving the balance unchanged', async ({
    page,
    request,
  }) => {
    test.skip(
      !isAiFailurePass(),
      'run with `npm run test:e2e:ai-failure` (STUB_AI_FAIL=1, STUB_AI_FAIL_ACTION=chat)',
    );

    // Pro tier meters every message; +3 credit on top of the 1 the setup scan
    // consumes leaves a known, nonzero starting balance — otherwise a
    // debit-then-refund cycle would be indistinguishable from "never charged".
    const { user, plantId } = await arrangeUserWithSavedPlant(request, {
      tier: 'pro',
      creditsAfterSetup: 3,
    });

    const balanceBefore = await request.get(`${API_BASE_URL}/v1/credits/balance`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect((await balanceBefore.json()).balance).toBe(3);

    await loginViaUi(page, user.email, user.password);
    await page.goto(`/plants/${plantId}`);
    await page.getByTestId('chat-entry-button').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();

    await page
      .getByPlaceholder('پیام خود را درباره این گیاه بنویسید...')
      .fill('این گیاه چه مشکلی دارد؟');
    await page.getByRole('button', { name: 'ارسال' }).click();

    // `ChatService`'s FAILURE_MESSAGE — proves the async job actually ran
    // (and failed), not merely that the send request was accepted.
    await expect(page.getByTestId('chat-history')).toContainText('پاسخ دستیار با خطا مواجه شد', {
      timeout: 20_000,
    });

    const balanceAfter = await request.get(`${API_BASE_URL}/v1/credits/balance`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect((await balanceAfter.json()).balance).toBe(3);
  });
});
