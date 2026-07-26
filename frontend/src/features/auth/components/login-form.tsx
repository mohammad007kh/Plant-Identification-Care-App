'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginRequestSchema, type LoginRequest } from 'shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { defaultLocale, getMessages } from '@/i18n';
import { getLoginErrorMessage, useLogin } from '../hooks/use-login';

/** FR-007: email/password login only — no third-party sign-in button. */
export function LoginForm() {
  const messages = getMessages(defaultLocale).auth;
  const loginMutation = useLogin();

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((data) => {
    loginMutation.mutate(data);
  });

  return (
    <Stack component="form" onSubmit={onSubmit} spacing={2} noValidate data-testid="login-form">
      <TextField
        {...registerField('email')}
        type="email"
        label={messages.emailLabel}
        error={!!errors.email}
        // The shared schema's built-in `.email()` message is English; the
        // field-level Persian copy below is shown regardless of its content.
        helperText={errors.email ? messages.errors.invalidEmail : undefined}
        fullWidth
      />
      <TextField
        {...registerField('password')}
        type="password"
        label={messages.passwordLabel}
        error={!!errors.password}
        fullWidth
      />

      {loginMutation.isError && (
        <Alert severity="error" data-testid="login-form-error">
          {getLoginErrorMessage(loginMutation.error)}
        </Alert>
      )}

      <Button type="submit" variant="contained" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? messages.login.submittingButton : messages.login.submitButton}
      </Button>
    </Stack>
  );
}

export default LoginForm;
