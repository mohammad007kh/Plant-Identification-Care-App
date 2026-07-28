'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Container from '@mui/material/Container';
import MuiLink from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { LoginForm } from '@/features/auth';

/**
 * Standalone login route. Deliberately renders `LoginForm` directly (not the
 * guest-conversion `RegistrationWall`) — the auth store's own doc comment on
 * `justConvertedFromGuest` anticipates exactly this: "standalone (non-wall)
 * registration entry points ... simply don't render the [guest-restored]
 * banner". `RegistrationWall` stays reserved for the guest-limit-403 path
 * inside `ScanFlow`'s consumers.
 *
 * Redirects home once a session exists — covers both an already-logged-in
 * visitor landing here and a successful login (the auth store's `setSession`
 * flips `accessToken` from `useLogin`'s `onSuccess`).
 */
export default function LoginPage() {
  const messages = getMessages(defaultLocale).auth;
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (accessToken !== null) {
      router.replace('/');
    }
  }, [accessToken, router]);

  return (
    <Container maxWidth="xs" sx={{ mt: 8, mb: 8 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h1">
            {messages.pages.loginHeading}
          </Typography>

          <LoginForm />

          <Typography variant="body2">
            {messages.wall.noAccountPrompt}{' '}
            <MuiLink component={Link} href="/register">
              {messages.wall.registerLinkLabel}
            </MuiLink>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
