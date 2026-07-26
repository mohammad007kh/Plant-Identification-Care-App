'use client';

import { useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { defaultLocale, getMessages } from '@/i18n';
import { useCreditBalance } from '../hooks/use-credit-balance';
import { useBillingStore } from '../store/billing-store';

/**
 * "Activating your subscription..." banner shown after returning from the
 * mock-Zarinpal checkout redirect (US4, FR-016/FR-018; mirrors `T-081`'s
 * server-side "never trust the redirect" rule). Rendered only while
 * `useBillingStore`'s `isReturningFromCheckout` flag is set — a route-level
 * concern owned by `T-097`, based solely on the *presence* of the gateway's
 * return query params, never their content.
 *
 * Never reads/trusts any `Authority`/`Status` query param itself: on mount it
 * force-refetches `GET /v1/credits/balance` from the server, and dismisses
 * (flips the store flag back off) only once that fresh, server-verified
 * fetch has actually resolved.
 */
export function CheckoutReturnBanner() {
  const isReturningFromCheckout = useBillingStore((state) => state.isReturningFromCheckout);
  const setReturningFromCheckout = useBillingStore((state) => state.setReturningFromCheckout);
  const messages = getMessages(defaultLocale).billing.checkoutReturn;
  const balanceQuery = useCreditBalance();
  const { refetch, isSuccess, isFetching, isError } = balanceQuery;

  // Force a fresh server fetch exactly once per "just returned" transition —
  // never assume the (possibly stale/cached) balance already reflects the
  // outcome of a checkout that may have completed moments ago.
  useEffect(() => {
    if (isReturningFromCheckout) {
      refetch();
    }
  }, [isReturningFromCheckout, refetch]);

  // Dismiss only once the re-fetch has actually settled successfully — the
  // banner never disappears based on the redirect's URL params alone.
  useEffect(() => {
    if (isReturningFromCheckout && isSuccess && !isFetching) {
      setReturningFromCheckout(false);
    }
  }, [isReturningFromCheckout, isSuccess, isFetching, setReturningFromCheckout]);

  if (!isReturningFromCheckout) {
    return null;
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        data-testid="checkout-return-banner-error"
        action={
          <Button type="button" color="inherit" size="small" onClick={() => refetch()}>
            {messages.retryButton}
          </Button>
        }
      >
        {messages.errorMessage}
      </Alert>
    );
  }

  return (
    <Alert
      severity="info"
      icon={<CircularProgress size={20} aria-hidden="true" />}
      data-testid="checkout-return-banner"
      role="status"
      aria-live="polite"
    >
      {messages.activatingMessage}
    </Alert>
  );
}

export default CheckoutReturnBanner;
