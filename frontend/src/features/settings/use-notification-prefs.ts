import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { NotificationPreferences, UpdateNotificationPreferencesRequest } from 'shared';
import { ApiError, getNotificationPreferences, updateNotificationPreferences } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';

type NotificationPrefsQueryKey = readonly ['settings', 'notification-prefs', string | null];

function notificationPrefsQueryKey(accessToken: string | null): NotificationPrefsQueryKey {
  return ['settings', 'notification-prefs', accessToken];
}

/**
 * `GET /v1/account/notifications` as a TanStack Query query (US7, FR-022).
 * Disabled while there is no authenticated session — every account endpoint
 * requires a bearer token. Keyed by `accessToken` so a login/logout never
 * serves another user's cached toggles.
 */
export function useNotificationPreferences(): UseQueryResult<NotificationPreferences, ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery<NotificationPreferences, ApiError>({
    queryKey: notificationPrefsQueryKey(accessToken),
    queryFn: () => getNotificationPreferences(accessToken as string),
    enabled: accessToken !== null,
  });
}

/**
 * `PATCH /v1/account/notifications` as a TanStack Query mutation (US7,
 * FR-022). Applies the patch to the cached preferences optimistically —
 * `NotificationSettings` needs a toggle to flip the instant it's clicked,
 * per FR-022 ("toggling off reflects immediately and stops future
 * notifications") — and rolls back to the pre-mutation snapshot on error so
 * the UI never keeps showing a state that failed to persist server-side.
 */
export function useUpdateNotificationPreferences(): UseMutationResult<
  NotificationPreferences,
  ApiError,
  UpdateNotificationPreferencesRequest,
  { previous: NotificationPreferences | undefined }
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const queryKey = notificationPrefsQueryKey(accessToken);

  return useMutation<
    NotificationPreferences,
    ApiError,
    UpdateNotificationPreferencesRequest,
    { previous: NotificationPreferences | undefined }
  >({
    mutationFn: (patch) => updateNotificationPreferences(accessToken as string, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationPreferences>(queryKey);

      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(queryKey, { ...previous, ...patch });
      }

      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}
