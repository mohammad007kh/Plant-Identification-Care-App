import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Plant } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { getPlant, PlantsApiError } from '../api/plants-api';

/**
 * `GET /v1/plants/:id` as a TanStack Query query (US3, FR-009). Disabled
 * while there is no authenticated session or no `plantId` yet (e.g. the
 * route param hasn't resolved), matching `useScanStatus`'s
 * disabled-until-ready convention in the sibling `scan` feature.
 */
export function usePlantDetail(plantId: string | null): UseQueryResult<Plant, PlantsApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery<Plant, PlantsApiError>({
    queryKey: ['plant', plantId],
    queryFn: () => {
      if (!accessToken || !plantId) {
        return Promise.reject(
          new PlantsApiError(0, 'usePlantDetail: accessToken and plantId are required'),
        );
      }

      return getPlant(accessToken, plantId);
    },
    enabled: accessToken !== null && plantId !== null,
  });
}
