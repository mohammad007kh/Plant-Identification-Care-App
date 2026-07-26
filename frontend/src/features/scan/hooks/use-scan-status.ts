import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ScanJob } from 'shared';
import { getScan } from '../api/scans-api';

/** Poll cadence while a scan job is still `pending` (US1 Acceptance Scenario 4). */
export const SCAN_POLL_INTERVAL_MS = 1500;

const TERMINAL_STATUSES: ReadonlySet<ScanJob['status']> = new Set(['completed', 'failed']);

/**
 * `GET /v1/scans/:id` as a polling TanStack Query query. Disabled while
 * `scanId` is `null` (no job submitted yet). Stops refetching as soon as the
 * job reaches a terminal status (`completed`/`failed`) to avoid wasted
 * requests/battery, per this task's contract.
 */
export function useScanStatus(scanId: string | null): UseQueryResult<ScanJob> {
  return useQuery<ScanJob>({
    queryKey: ['scan', scanId],
    queryFn: () => {
      if (!scanId) {
        return Promise.reject(new Error('useScanStatus: scanId is required to poll'));
      }

      return getScan(scanId);
    },
    enabled: scanId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : SCAN_POLL_INTERVAL_MS;
    },
  });
}
