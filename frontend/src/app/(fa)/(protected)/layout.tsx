'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';

/**
 * Protected route-group guard (T-057). This route group `(protected)` does NOT
 * change the public URL, so `/account`, `/plants`, `/billing`, `/settings`
 * stay identical — the group only lets these routes share this client-side
 * guard layout.
 *
 * Gating is driven by `authStatus`, NOT by `accessToken !== null`, because the
 * token is memory-only and always absent on a hard reload:
 *   - `unknown`       → loading state, NO redirect (waits for `SessionBootstrap`
 *     to finish the transparent refresh; redirecting here would bounce a
 *     logged-in user reloading a protected page to `/login` prematurely).
 *   - `guest`         → redirect to `/login`.
 *   - `authenticated` → render children.
 *
 * This is UX only; the backend guards every `/v1/*` request server-side.
 * `admin/` keeps its OWN guard layout and is deliberately NOT part of this group.
 */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const messages = getMessages(defaultLocale).protected;
  const authStatus = useAuthStore((state) => state.authStatus);
  const router = useRouter();

  useEffect(() => {
    if (authStatus === 'guest') {
      router.replace('/login');
    }
  }, [authStatus, router]);

  if (authStatus === 'authenticated') {
    return <>{children}</>;
  }

  // `unknown` (rehydrating) and `guest` (redirect in flight) both show the
  // lightweight loading state rather than the protected content.
  return (
    <Stack
      alignItems="center"
      spacing={2}
      role="status"
      aria-live="polite"
      data-testid="protected-layout-loading"
      sx={{ py: 8 }}
    >
      <CircularProgress aria-label={messages.loadingLabel} />
      <Typography variant="body2">{messages.loadingLabel}</Typography>
    </Stack>
  );
}
