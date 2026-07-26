/**
 * Full-page navigation to the (external) mock-Zarinpal checkout URL returned
 * by `POST /v1/payments/checkout`. Extracted into its own function — rather
 * than inlining `window.location.href = url` in `UpgradeModal` — purely so
 * tests can mock it directly instead of relying on jsdom's unimplemented
 * `window.location` navigation.
 */
export function redirectToCheckout(url: string): void {
  window.location.href = url;
}
