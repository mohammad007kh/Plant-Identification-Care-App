import { create } from 'zustand';

interface BillingState {
  /** Controls `UpgradeModal`'s open/closed state. */
  isUpgradeModalOpen: boolean;
  /**
   * Set once the app has just returned from the mock-Zarinpal checkout
   * redirect (a route-level concern owned by `T-097`, based solely on the
   * *presence* of the gateway's return query params — never their content,
   * per the "never trust the redirect" rule). While true, `CheckoutReturnBanner`
   * re-fetches and displays the server-verified credit balance/tier.
   */
  isReturningFromCheckout: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  setReturningFromCheckout: (value: boolean) => void;
}

/**
 * Billing slice (registry: `frontend.state_management` = zustand). A plain
 * store with no side effects baked in: `T-097` drives `openUpgradeModal()`
 * from a global 402 interceptor and `setReturningFromCheckout(true)` from a
 * global redirect-return route guard, without this feature needing to know
 * about either. `CheckoutReturnBanner` itself flips `isReturningFromCheckout`
 * back to `false` once the re-fetched balance has resolved.
 */
export const useBillingStore = create<BillingState>((set) => ({
  isUpgradeModalOpen: false,
  isReturningFromCheckout: false,
  openUpgradeModal: () => set({ isUpgradeModalOpen: true }),
  closeUpgradeModal: () => set({ isUpgradeModalOpen: false }),
  setReturningFromCheckout: (value) => set({ isReturningFromCheckout: value }),
}));
