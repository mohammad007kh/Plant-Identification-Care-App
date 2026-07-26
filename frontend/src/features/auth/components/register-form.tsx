'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { registerRequestSchema, type RegisterRequest } from 'shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { defaultLocale, getMessages } from '@/i18n';
import { getRegisterErrorMessage, useRegister } from '../hooks/use-register';

/**
 * FR-007: email/password registration only — no Google/third-party button is
 * imported or rendered here, consistent with the v1 scope.
 */
export function RegisterForm() {
  const messages = getMessages(defaultLocale).auth;
  const registerMutation = useRegister();

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((data) => {
    registerMutation.mutate(data);
  });

  return (
    <Stack component="form" onSubmit={onSubmit} spacing={2} noValidate data-testid="register-form">
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
        // The shared password schema already carries Persian messages.
        helperText={errors.password?.message}
        fullWidth
      />

      {registerMutation.isError && (
        <Alert severity="error" data-testid="register-form-error">
          {getRegisterErrorMessage(registerMutation.error)}
        </Alert>
      )}

      <Button type="submit" variant="contained" disabled={registerMutation.isPending}>
        {registerMutation.isPending
          ? messages.register.submittingButton
          : messages.register.submitButton}
      </Button>
    </Stack>
  );
}

export default RegisterForm;
