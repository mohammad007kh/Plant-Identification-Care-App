'use client';

import { useState } from 'react';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { GuestScansRestoredBanner } from './guest-scans-restored-banner';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

type WallMode = 'register' | 'login';

/**
 * FR-007/FR-008: shown in place of the scan result when a scan attempt is
 * rejected with the guest-limit 403 (a UI reaction to that specific API
 * response — the client never re-implements the 2-scan count itself, per
 * the domain rules). Only email/password auth is offered — a login link is
 * included for a guest who already has an account, but no OAuth/social
 * button is ever rendered.
 *
 * After a successful registration from this wall, `useRegister` marks
 * `justConvertedFromGuest` on the auth store; this component reacts to that
 * flag by swapping to `GuestScansRestoredBanner` so the user gets an
 * explicit confirmation their prior guest scans survived (FR-008), not a
 * silent redirect.
 */
export function RegistrationWall() {
  const messages = getMessages(defaultLocale).auth.wall;
  const [mode, setMode] = useState<WallMode>('register');
  const justConvertedFromGuest = useAuthStore((state) => state.justConvertedFromGuest);
  const acknowledgeGuestConversion = useAuthStore((state) => state.acknowledgeGuestConversion);

  if (justConvertedFromGuest) {
    return <GuestScansRestoredBanner onDismiss={acknowledgeGuestConversion} />;
  }

  return (
    <Paper data-testid="registration-wall" variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {messages.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {messages.description}
        </Typography>

        {mode === 'register' ? (
          <>
            <RegisterForm />
            <Typography variant="body2">
              {messages.hasAccountPrompt}{' '}
              <Link component="button" type="button" onClick={() => setMode('login')}>
                {messages.loginLinkLabel}
              </Link>
            </Typography>
          </>
        ) : (
          <>
            <LoginForm />
            <Typography variant="body2">
              {messages.noAccountPrompt}{' '}
              <Link component="button" type="button" onClick={() => setMode('register')}>
                {messages.registerLinkLabel}
              </Link>
            </Typography>
          </>
        )}
      </Stack>
    </Paper>
  );
}

export default RegistrationWall;
