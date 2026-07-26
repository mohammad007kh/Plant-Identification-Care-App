import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Plan } from 'shared';
import { BillingApiError, getPlans } from '../api/billing-api';

/**
 * `GET /v1/subscriptions/plans` as a TanStack Query query (FR-016, SC-006).
 * Public endpoint — no auth gate, unlike the other billing hooks. `UpgradeModal`
 * renders whatever this resolves with; it must never fall back to a
 * hardcoded plan list on loading/error.
 */
export function usePlans(): UseQueryResult<Plan[], BillingApiError> {
  return useQuery<Plan[], BillingApiError>({
    queryKey: ['billing', 'plans'],
    queryFn: getPlans,
  });
}
