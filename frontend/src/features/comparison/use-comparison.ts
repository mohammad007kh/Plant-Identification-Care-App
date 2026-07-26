import { useCallback, useState } from 'react';
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store/auth-store';
import { ApiError, getScanJob, submitFollowUpPhoto, type ComparisonScanJob } from '@/lib/api';

/** Poll cadence while a comparison scan job is still `pending` — matches `useScanStatus`. */
export const COMPARISON_POLL_INTERVAL_MS = 1500;

const TERMINAL_STATUSES: ReadonlySet<ComparisonScanJob['status']> = new Set([
  'completed',
  'failed',
]);

export interface UseComparisonResult {
  /** Submits a follow-up photo for the given plant (T-060's multipart endpoint). */
  submit: (photo: File) => void;
  isSubmitting: boolean;
  /** Present only when the submission itself (not the async job) failed. */
  submitError: ApiError | null;
  /** `null` until a submission succeeds; the id being polled thereafter. */
  scanId: string | null;
  /** Poll result — `enabled` only once `scanId` is set (mirrors `useScanStatus`). */
  status: UseQueryResult<ComparisonScanJob, ApiError>;
  /** Clears `scanId` and the submission state, returning the panel to its upload form. */
  reset: () => void;
}

/**
 * Orchestrates the US5 follow-up-photo flow for a single plant: submit →
 * poll → terminal result, mirroring the sibling `scan` feature's
 * `useCreateScan`/`useScanStatus` pair but combined into one hook per this
 * task's (lighter) scope. Requires an authenticated session — both the
 * mutation and the poll reject defensively when `accessToken` is missing,
 * the same convention `usePlantDetail` uses (this panel only ever mounts
 * inside the already-authenticated `PlantDetail` view in practice).
 */
export function useComparison(plantId: string): UseComparisonResult {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [scanId, setScanId] = useState<string | null>(null);

  const submitMutation = useMutation<ComparisonScanJob, ApiError, File>({
    mutationFn: (photo: File) => {
      if (!accessToken) {
        return Promise.reject(new ApiError(0, null));
      }

      return submitFollowUpPhoto(accessToken, plantId, photo);
    },
    onSuccess: (job) => setScanId(job.id),
  });

  const statusQuery = useQuery<ComparisonScanJob, ApiError>({
    queryKey: ['comparison-scan', scanId],
    queryFn: () => {
      if (!scanId) {
        return Promise.reject(new ApiError(0, null));
      }

      return getScanJob(scanId);
    },
    enabled: scanId !== null,
    refetchInterval: (query) => {
      const jobStatus = query.state.data?.status;
      return jobStatus && TERMINAL_STATUSES.has(jobStatus) ? false : COMPARISON_POLL_INTERVAL_MS;
    },
  });

  const submit = useCallback(
    (photo: File) => {
      submitMutation.mutate(photo);
    },
    [submitMutation],
  );

  const reset = useCallback(() => {
    setScanId(null);
    submitMutation.reset();
  }, [submitMutation]);

  return {
    submit,
    isSubmitting: submitMutation.isPending,
    submitError: submitMutation.error,
    scanId,
    status: statusQuery,
    reset,
  };
}
