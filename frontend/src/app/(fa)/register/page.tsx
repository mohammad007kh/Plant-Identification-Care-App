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
import { RegisterForm } from '@/features/auth';

/**
 * Standalone registration route — see `login/page.tsx` for why this renders
 * `RegisterForm` directly rather than the guest-conversion `RegistrationWall`.
 *
 * Redirects home once a session exists (covers both an already-logged-in
 * visitor landing here and a successful registration).
 */
export default function RegisterPage() {
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
            {messages.pages.registerHeading}
          </Typography>

          <RegisterForm />

          <Typography variant="body2">
            {messages.wall.hasAccountPrompt}{' '}
            <MuiLink component={Link} href="/login">
              {messages.wall.loginLinkLabel}
            </MuiLink>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
