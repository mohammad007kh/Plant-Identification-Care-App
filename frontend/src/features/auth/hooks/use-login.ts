import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { AuthTokenResponse, LoginRequest } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { AuthApiError, login } from '../api/auth-api';

/** `POST /v1/auth/login` as a TanStack Query mutation. */
export function useLogin(): UseMutationResult<AuthTokenResponse, AuthApiError, LoginRequest> {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation<AuthTokenResponse, AuthApiError, LoginRequest>({
    mutationFn: login,
    onSuccess: ({ accessToken }) => setSession({ accessToken }),
  });
}

/**
 * Translates a login failure into user-facing Persian copy. The 401
 * (invalid credentials) case gets a specific message; everything else falls
 * back to a generic retry prompt.
 */
export function getLoginErrorMessage(error: unknown): string {
  const messages = getMessages(defaultLocale).auth.login.errors;

  if (error instanceof AuthApiError && error.status === 401) {
    return messages.invalidCredentials;
  }

  return messages.generic;
}
