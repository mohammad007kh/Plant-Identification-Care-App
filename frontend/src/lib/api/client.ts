import type { AuthTokenResponse } from 'shared';
import { refresh } from '@/features/auth/api/auth-api';
import { useAuthStore } from '@/lib/store/auth-store';

/**
 * Base URL for the backend API (same convention as `lib/api/index.ts` and the
 * per-feature API modules).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/** Thrown for any non-2xx response `apiClient` gives up on (after the refresh+retry path). */
export class ApiClientError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

/**
 * Single-flight refresh (T-057). When N requests race and all see a 401, they
 * must trigger exactly ONE `POST /v1/auth/refresh`, not N. The first caller
 * starts the refresh and stashes the in-flight promise here; concurrent callers
 * await the same promise. The `finally` clears the slot once it settles so a
 * later, independent 401 can start a fresh refresh.
 */
let inFlightRefresh: Promise<AuthTokenResponse> | null = null;

function refreshOnce(): Promise<AuthTokenResponse> {
  if (inFlightRefresh === null) {
    inFlightRefresh = refresh().finally(() => {
      inFlightRefresh = null;
    });
  }

  return inFlightRefresh;
}

/**
 * Browser-only redirect to the login route. Guarded so an accidental
 * server-side call (SSR/RSC) is a no-op rather than a `window is not defined`
 * crash. Uses `window.location.assign` (a full navigation) deliberately: the
 * session is gone, so a hard load that re-runs `SessionBootstrap` from a clean
 * slate is the safest recovery.
 */
function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}

/**
 * Authenticated fetch wrapper (T-057) for future/authenticated call sites.
 * Attaches the in-memory access token as a bearer, sends the refresh cookie
 * (`credentials: 'include'`), and transparently recovers from a mid-session
 * 401:
 *   1. On a 401, run a SINGLE-FLIGHT `refresh()` (concurrent 401s dedupe onto
 *      one in-flight refresh).
 *   2. On refresh success, write the new token to the store and retry the
 *      original request exactly ONCE.
 *   3. On refresh failure, clear the session and redirect to `/login`.
 * Never loops beyond that one refresh+retry.
 */
export async function apiClient<T>(
  path: string,
  init: RequestInit = {},
  parse: (body: unknown) => T = (body) => body as T,
): Promise<T> {
  const runRequest = (): Promise<Response> => {
    const { accessToken } = useAuthStore.getState();
    const headers: HeadersInit = {
      ...init.headers,
      ...(accessToken !== null ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    return fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  };

  let response = await runRequest();

  if (response.status === 401) {
    try {
      const { accessToken } = await refreshOnce();
      useAuthStore.getState().setSession({ accessToken });
    } catch {
      useAuthStore.getState().clearSession();
      redirectToLogin();
      throw new ApiClientError(401);
    }

    // Retry the original request exactly once with the refreshed token.
    response = await runRequest();
  }

  if (!response.ok) {
    throw new ApiClientError(response.status);
  }

  return parse(await response.json());
}
