import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CreditBalance } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { BillingApiError, getCreditBalance } from '../api/billing-api';

/**
 * `GET /v1/credits/balance` as a TanStack Query query. Disabled while there is
 * no authenticated session — the endpoint requires a bearer token. Included
 * in the query key so a login/logout (different `accessToken`) is treated as
 * a fresh query rather than serving another user's cached balance.
 */
export function useCreditBalance(): UseQueryResult<CreditBalance, BillingApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery<CreditBalance, BillingApiError>({
    queryKey: ['billing', 'credit-balance', accessToken],
    queryFn: () => getCreditBalance(accessToken as string),
    enabled: accessToken !== null,
  });
}
