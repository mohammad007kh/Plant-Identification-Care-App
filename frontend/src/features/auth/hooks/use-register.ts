import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { AuthTokenResponse, RegisterRequest } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { AuthApiError, register } from '../api/auth-api';

/** `POST /v1/auth/register` as a TanStack Query mutation. */
export function useRegister(): UseMutationResult<AuthTokenResponse, AuthApiError, RegisterRequest> {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation<AuthTokenResponse, AuthApiError, RegisterRequest>({
    mutationFn: register,
    onSuccess: ({ accessToken }) => {
      // FR-008: registration always merges the guest session's prior scans
      // server-side (T-041); `justConvertedFromGuest` lets
      // `guest-scans-restored-banner.tsx` confirm that to the user on the
      // wall→register path (the token itself must live in memory only, per
      // the auth model — never `localStorage`).
      setSession({ accessToken, justConvertedFromGuest: true });
    },
  });
}

/**
 * Translates a registration failure into user-facing Persian copy.
 * The 409 (duplicate email) case gets a specific message per the task's
 * domain rules; everything else falls back to a generic retry prompt.
 */
export function getRegisterErrorMessage(error: unknown): string {
  const messages = getMessages(defaultLocale).auth.register.errors;

  if (error instanceof AuthApiError && error.status === 409) {
    return messages.emailTaken;
  }

  return messages.generic;
}
