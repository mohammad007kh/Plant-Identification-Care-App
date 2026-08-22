'use client';

import { useEffect, useRef } from 'react';
import { refresh } from '@/features/auth/api/auth-api';
import { useAuthStore } from '@/lib/store/auth-store';

/**
 * Session rehydration (T-057). On a hard page load the access token is gone
 * (memory-only by design), so this runs the transparent
 * `POST /v1/auth/refresh` exactly once on mount:
 *   - success → `setSession` (store flips `authStatus` to `authenticated`)
 *   - failure → `setAuthStatus('guest')`
 *
 * Mounted inside `providers.tsx` so EVERY route rehydrates on a hard load. The
 * `useRef` guard makes the refresh fire only once even under React 18
 * StrictMode's double-invoked effects; `useEffect` guarantees browser-only
 * execution (it never runs during SSR). Renders nothing.
 */
export function SessionBootstrap(): null {
  const hasRun = useRef(false);
  const setSession = useAuthStore((state) => state.setSession);
  const setAuthStatus = useAuthStore((state) => state.setAuthStatus);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    void refresh()
      .then(({ accessToken }) => setSession({ accessToken }))
      .catch(() => setAuthStatus('guest'));
  }, [setSession, setAuthStatus]);

  return null;
}

export default SessionBootstrap;
