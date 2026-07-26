import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { CheckoutRequest, CheckoutResponse } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { BillingApiError, checkout } from '../api/billing-api';

/**
 * `POST /v1/payments/checkout` as a TanStack Query mutation. Resolves with
 * the mock-Zarinpal `redirectUrl` (T-081) — navigating to it is the caller's
 * (`UpgradeModal`'s) responsibility; this hook never triggers navigation
 * itself, keeping it independently testable.
 */
export function useCheckout(): UseMutationResult<
  CheckoutResponse,
  BillingApiError,
  CheckoutRequest
> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useMutation<CheckoutResponse, BillingApiError, CheckoutRequest>({
    mutationFn: (payload) => checkout(accessToken as string, payload),
  });
}
