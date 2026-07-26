import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { DeletionStatusResponse } from 'shared';
import {
  ApiError,
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
} from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';

type AccountDeletionQueryKey = readonly ['account', 'deletion-status', string | null];

function accountDeletionQueryKey(accessToken: string | null): AccountDeletionQueryKey {
  return ['account', 'deletion-status', accessToken];
}

/**
 * `GET /v1/account/deletion` as a TanStack Query query (US8, FR-023).
 * Disabled while there is no authenticated session — every account endpoint
 * requires a bearer token. `PendingDeletionBanner` relies on this alone to
 * decide whether to render: it stays hidden until this resolves with
 * `deletionStatus === 'pending_deletion'`.
 */
export function useAccountDeletionStatus(): UseQueryResult<DeletionStatusResponse, ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery<DeletionStatusResponse, ApiError>({
    queryKey: accountDeletionQueryKey(accessToken),
    queryFn: () => getAccountDeletionStatus(accessToken as string),
    enabled: accessToken !== null,
  });
}

/**
 * `POST /v1/account/deletion` as a TanStack Query mutation (US8, FR-023).
 * Writes the fresh `pending_deletion` status straight into the status
 * query's cache on success, so `PendingDeletionBanner` (and any other reader
 * of `useAccountDeletionStatus`) picks it up immediately without an extra
 * round trip.
 */
export function useRequestAccountDeletion(): UseMutationResult<
  DeletionStatusResponse,
  ApiError,
  void
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<DeletionStatusResponse, ApiError, void>({
    mutationFn: () => requestAccountDeletion(accessToken as string),
    onSuccess: (data) => {
      queryClient.setQueryData(accountDeletionQueryKey(accessToken), data);
    },
  });
}

/**
 * `DELETE /v1/account/deletion` as a TanStack Query mutation (US8, FR-023).
 * Per the domain rule, cancelling must restore the normal UI immediately —
 * writing the resulting `active` status straight into the cache does that
 * without waiting on a refetch.
 */
export function useCancelAccountDeletion(): UseMutationResult<
  DeletionStatusResponse,
  ApiError,
  void
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<DeletionStatusResponse, ApiError, void>({
    mutationFn: () => cancelAccountDeletion(accessToken as string),
    onSuccess: (data) => {
      queryClient.setQueryData(accountDeletionQueryKey(accessToken), data);
    },
  });
}
