import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AdminConfig,
  AdminSpecies,
  AdminTier,
  AdminUserActionRequest,
  AdminUserListResponse,
  AdminUserSummary,
  AdminMisidentificationReportListResponse,
  CreateSpeciesRequest,
  UpdateAdminConfigRequest,
  UpdateSpeciesRequest,
  UpdateTierRequest,
} from 'shared';
import {
  ApiError,
  createAdminSpecies,
  getAdminConfig,
  getAdminUser,
  listAdminMisidentificationReports,
  listAdminSpecies,
  listAdminTiers,
  listAdminUsers,
  updateAdminConfig,
  updateAdminSpecies,
  updateAdminTier,
  updateAdminUser,
  type ListAdminMisidentificationReportsParams,
  type ListAdminUsersParams,
} from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { getRoleFromAccessToken } from './lib/get-role-from-token';

/** Page size for the cursor-paginated admin lists (users, reports). */
export const ADMIN_PAGE_SIZE = 20;

/**
 * `true` once an authenticated session's access token decodes to
 * `role: 'admin'` (UX gate only — see `get-role-from-token.ts`). `AdminLayout`
 * and every section hook below share this so a token that stops being admin
 * (e.g. after logout) never keeps stale admin queries enabled.
 */
export function useIsAdmin(): boolean {
  const accessToken = useAuthStore((state) => state.accessToken);
  return getRoleFromAccessToken(accessToken) === 'admin';
}

// --- Catalog (species) — FR-024 ---

export function useAdminSpecies(): UseQueryResult<AdminSpecies[], ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useQuery<AdminSpecies[], ApiError>({
    queryKey: ['admin', 'species', accessToken],
    queryFn: () => listAdminSpecies(accessToken as string),
    enabled: isAdmin && accessToken !== null,
  });
}

export function useCreateAdminSpecies(): UseMutationResult<
  AdminSpecies,
  ApiError,
  CreateSpeciesRequest
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<AdminSpecies, ApiError, CreateSpeciesRequest>({
    mutationFn: (payload) => createAdminSpecies(accessToken as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'species'] });
    },
  });
}

export interface UpdateAdminSpeciesVariables {
  publicId: string;
  payload: UpdateSpeciesRequest;
}

export function useUpdateAdminSpecies(): UseMutationResult<
  AdminSpecies,
  ApiError,
  UpdateAdminSpeciesVariables
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<AdminSpecies, ApiError, UpdateAdminSpeciesVariables>({
    mutationFn: ({ publicId, payload }) =>
      updateAdminSpecies(accessToken as string, publicId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'species'] });
    },
  });
}

// --- Live config — FR-005/FR-021/FR-027 ---

export function useAdminConfig(): UseQueryResult<AdminConfig, ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useQuery<AdminConfig, ApiError>({
    queryKey: ['admin', 'config', accessToken],
    queryFn: () => getAdminConfig(accessToken as string),
    enabled: isAdmin && accessToken !== null,
  });
}

export function useUpdateAdminConfig(): UseMutationResult<
  AdminConfig,
  ApiError,
  UpdateAdminConfigRequest
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<AdminConfig, ApiError, UpdateAdminConfigRequest>({
    mutationFn: (payload) => updateAdminConfig(accessToken as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
    },
  });
}

// --- Tier allowances — FR-014/FR-019 ---

export function useAdminTiers(): UseQueryResult<AdminTier[], ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useQuery<AdminTier[], ApiError>({
    queryKey: ['admin', 'tiers', accessToken],
    queryFn: () => listAdminTiers(accessToken as string),
    enabled: isAdmin && accessToken !== null,
  });
}

export function useUpdateAdminTier(): UseMutationResult<AdminTier, ApiError, UpdateTierRequest> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<AdminTier, ApiError, UpdateTierRequest>({
    mutationFn: (payload) => updateAdminTier(accessToken as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
    },
  });
}

// --- Users — FR-026 ---

type AdminUsersQueryKey = readonly ['admin', 'users', string | null, string];

/**
 * `GET /v1/admin/users` as a cursor-paginated infinite query (mirrors
 * `usePlantsList`), keyed by the current search term so changing it starts a
 * fresh paginated result set instead of appending to the previous search's
 * pages.
 */
export function useAdminUsers(
  search: string,
): UseInfiniteQueryResult<InfiniteData<AdminUserListResponse>, ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useInfiniteQuery<
    AdminUserListResponse,
    ApiError,
    InfiniteData<AdminUserListResponse>,
    AdminUsersQueryKey,
    string | undefined
  >({
    queryKey: ['admin', 'users', accessToken, search],
    queryFn: ({ pageParam }) => {
      const params: ListAdminUsersParams = { cursor: pageParam, limit: ADMIN_PAGE_SIZE };
      if (search.trim().length > 0) params.q = search.trim();
      return listAdminUsers(accessToken as string, params);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAdmin && accessToken !== null,
  });
}

export function useAdminUser(publicId: string | null): UseQueryResult<AdminUserSummary, ApiError> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useQuery<AdminUserSummary, ApiError>({
    queryKey: ['admin', 'user', accessToken, publicId],
    queryFn: () => getAdminUser(accessToken as string, publicId as string),
    enabled: isAdmin && accessToken !== null && publicId !== null,
  });
}

export interface UpdateAdminUserVariables {
  publicId: string;
  payload: AdminUserActionRequest;
}

export function useAdminUserAction(): UseMutationResult<
  AdminUserSummary,
  ApiError,
  UpdateAdminUserVariables
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation<AdminUserSummary, ApiError, UpdateAdminUserVariables>({
    mutationFn: ({ publicId, payload }) =>
      updateAdminUser(accessToken as string, publicId, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.setQueryData(['admin', 'user', accessToken, updated.publicId], updated);
    },
  });
}

// --- Misidentification reports (read-only) — FR-025 ---

type AdminReportsQueryKey = readonly ['admin', 'reports', string | null];

export function useAdminMisidentificationReports(): UseInfiniteQueryResult<
  InfiniteData<AdminMisidentificationReportListResponse>,
  ApiError
> {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAdmin = useIsAdmin();

  return useInfiniteQuery<
    AdminMisidentificationReportListResponse,
    ApiError,
    InfiniteData<AdminMisidentificationReportListResponse>,
    AdminReportsQueryKey,
    string | undefined
  >({
    queryKey: ['admin', 'reports', accessToken],
    queryFn: ({ pageParam }) =>
      listAdminMisidentificationReports(accessToken as string, {
        cursor: pageParam,
        limit: ADMIN_PAGE_SIZE,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAdmin && accessToken !== null,
  });
}

export type { ListAdminMisidentificationReportsParams, ListAdminUsersParams };
