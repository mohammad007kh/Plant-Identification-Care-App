'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { logout } from '@/features/auth/api/auth-api';
import { useIsAdmin } from '@/features/admin';

/**
 * App-wide top navigation, mounted once in the root `(fa)` layout above every
 * route. Auth-aware per this wiring task's spec: a logged-out visitor sees
 * only the scan-flow home link + a login link; a logged-in user additionally
 * sees plants/billing/settings/account + logout; the admin link only renders
 * for a `role=admin` session (`useIsAdmin`, the same UX-only decode the
 * `/admin` route group's own layout uses — the backend `AdminGuard` remains
 * the real enforcement boundary).
 *
 * Only block-axis (`py`) spacing is used below; `Stack`'s `spacing` prop
 * renders as logical (`margin-inline-start`) CSS under MUI v6, so it stays
 * RTL-safe without any manual inline-axis (`ml`/`mr`) overrides.
 */
export function MainNav() {
  const messages = getMessages(defaultLocale).nav;
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isAdmin = useIsAdmin();
  const isLoggedIn = accessToken !== null;

  const handleLogout = async (): Promise<void> => {
    // Best-effort server-side cookie clear (T-057). A network failure must
    // never trap the user in a logged-in-looking UI, so the local clear +
    // redirect always run regardless of the request outcome.
    try {
      await logout();
    } catch {
      // Tolerated: fall through to the local clear below.
    }
    clearSession();
    router.push('/');
  };

  return (
    <AppBar position="static" color="default" elevation={0} data-testid="main-nav">
      <Toolbar sx={{ flexWrap: 'wrap', py: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexGrow: 1, flexWrap: 'wrap' }}
        >
          <Typography
            component={Link}
            href="/"
            variant="subtitle1"
            fontWeight={700}
            sx={{ textDecoration: 'none', color: 'inherit' }}
          >
            {messages.home}
          </Typography>

          {isLoggedIn && (
            <Button component={Link} href="/plants" size="small" data-testid="nav-plants-link">
              {messages.plants}
            </Button>
          )}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          {isLoggedIn ? (
            <>
              <Button component={Link} href="/billing" size="small" data-testid="nav-billing-link">
                {messages.billing}
              </Button>
              <Button
                component={Link}
                href="/settings"
                size="small"
                data-testid="nav-settings-link"
              >
                {messages.settings}
              </Button>
              <Button component={Link} href="/account" size="small" data-testid="nav-account-link">
                {messages.account}
              </Button>
              {isAdmin && (
                <Button component={Link} href="/admin" size="small" data-testid="nav-admin-link">
                  {messages.admin}
                </Button>
              )}
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={() => {
                  void handleLogout();
                }}
                data-testid="nav-logout-button"
              >
                {messages.logout}
              </Button>
            </>
          ) : (
            <Button
              component={Link}
              href="/login"
              variant="outlined"
              size="small"
              data-testid="nav-login-link"
            >
              {messages.login}
            </Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

export default MainNav;
