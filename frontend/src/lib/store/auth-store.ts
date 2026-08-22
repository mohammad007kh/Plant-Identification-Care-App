import { create } from 'zustand';

/**
 * Minimal authenticated-user shape the frontend currently needs. Extend here
 * (not by duplicating a second store) as later tasks require more profile
 * fields.
 */
export interface AuthUser {
  email: string;
}

export interface AuthSession {
  accessToken: string;
  user?: AuthUser | null;
  /**
   * FR-008: set by `useRegister` on every successful registration (the
   * backend always merges the guest session's scans, per T-041) so
   * `RegistrationWall`/`GuestScansRestoredBanner` can confirm this to the
   * user on the wall→register path. Standalone (non-wall) registration entry
   * points added later simply don't render the banner, regardless of this
   * flag.
   */
  justConvertedFromGuest?: boolean;
}

/**
 * Session lifecycle as seen by the UI:
 * - `unknown`  — before the transparent refresh (T-057) has resolved on a hard
 *   load; protected routes MUST show a loading state, not redirect, in this
 *   window so a logged-in user reloading a protected page isn't bounced to
 *   `/login` before rehydration finishes.
 * - `authenticated` — a valid access token is in memory (set by login/register
 *   or a successful refresh).
 * - `guest` — no session (never logged in, logged out, or the refresh failed).
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'guest';

interface AuthState {
  /**
   * Short-lived JWT, kept in memory ONLY (never `localStorage`) to limit XSS
   * blast radius — the refresh token is a separate httpOnly cookie the
   * client never reads. Lost on a hard page reload by design; T-057 wires a
   * transparent `POST /v1/auth/refresh` (via that cookie) to re-establish it.
   */
  accessToken: string | null;
  user: AuthUser | null;
  justConvertedFromGuest: boolean;
  /**
   * Rehydration state (T-057). Starts `unknown` so `SessionBootstrap` can run
   * the one-shot refresh before any protected route decides to redirect.
   */
  authStatus: AuthStatus;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  /** Resets the guest-conversion flag once the confirmation banner has been shown/dismissed. */
  acknowledgeGuestConversion: () => void;
  /**
   * Marks the session state without touching the token. Used by
   * `SessionBootstrap` to flip `unknown` → `guest` when the transparent
   * refresh fails (no token to set, but the UI must stop showing the loading
   * state and treat the visitor as logged out).
   */
  setAuthStatus: (status: AuthStatus) => void;
}

/**
 * Auth slice (registry: `frontend.state_management` = zustand). Created here
 * because `useRegister`/`useLogin` (T-043) need somewhere to put the access
 * token to be functional and testable; T-057 wires the rest of the app
 * (nav, protected routes, refresh interceptor) against this same store per
 * its own task file, which explicitly anticipates extending — not
 * recreating — this file if it already exists.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  justConvertedFromGuest: false,
  authStatus: 'unknown',
  setSession: ({ accessToken, user = null, justConvertedFromGuest = false }) =>
    set({ accessToken, user, justConvertedFromGuest, authStatus: 'authenticated' }),
  clearSession: () =>
    set({ accessToken: null, user: null, justConvertedFromGuest: false, authStatus: 'guest' }),
  acknowledgeGuestConversion: () => set({ justConvertedFromGuest: false }),
  setAuthStatus: (authStatus) => set({ authStatus }),
}));
