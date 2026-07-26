import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ScanJob } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
import { createScan, ScanApiError } from '../api/scans-api';

/**
 * Fresh idempotency key per submission (FR-001 API contract): required for
 * authenticated requests and harmless for guest requests, so it is always
 * generated and sent. Falls back to a timestamp+random id if the Web Crypto
 * `randomUUID` is unavailable (older browsers / test runners).
 */
function generateIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** `POST /v1/scans` as a TanStack Query mutation. */
export function useCreateScan(): UseMutationResult<ScanJob, ScanApiError, File> {
  return useMutation<ScanJob, ScanApiError, File>({
    mutationFn: (photo: File) => createScan(photo, generateIdempotencyKey()),
  });
}

/**
 * Translates a scan-submission failure into user-facing Persian copy.
 * The 415 (disallowed file type) case gets a specific message per FR-001;
 * everything else falls back to a generic retry prompt.
 */
export function getScanSubmitErrorMessage(error: unknown): string {
  const messages = getMessages(defaultLocale).scan.upload.errors;

  if (error instanceof ScanApiError && error.status === 415) {
    return messages.unsupportedType;
  }

  return messages.generic;
}
