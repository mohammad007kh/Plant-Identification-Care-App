import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store/auth-store';
import { listPlants, PlantsApiError, type PlantsPage } from '../api/plants-api';

/** Page size for `GET /v1/plants` (matches the backend's own default, `T-060`). */
export const PLANTS_PAGE_SIZE = 20;

type PlantsQueryKey = readonly ['plants', string | null];

/**
 * `GET /v1/plants` as a cursor-paginated TanStack Query infinite query (US3,
 * FR-009). Disabled while there is no authenticated session — every plants
 * endpoint requires a bearer token (`T-060`), so there is nothing to fetch
 * yet; `PlantList` treats that the same as "no data" until login completes.
 */
export function usePlantsList(): UseInfiniteQueryResult<InfiniteData<PlantsPage>, PlantsApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useInfiniteQuery<
    PlantsPage,
    PlantsApiError,
    InfiniteData<PlantsPage>,
    PlantsQueryKey,
    string | undefined
  >({
    queryKey: ['plants', accessToken],
    queryFn: ({ pageParam }) =>
      listPlants(accessToken as string, { cursor: pageParam, limit: PLANTS_PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: accessToken !== null,
  });
}
