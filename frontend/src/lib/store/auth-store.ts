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
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  /** Resets the guest-conversion flag once the confirmation banner has been shown/dismissed. */
  acknowledgeGuestConversion: () => void;
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
  setSession: ({ accessToken, user = null, justConvertedFromGuest = false }) =>
    set({ accessToken, user, justConvertedFromGuest }),
  clearSession: () => set({ accessToken: null, user: null, justConvertedFromGuest: false }),
  acknowledgeGuestConversion: () => set({ justConvertedFromGuest: false }),
}));
