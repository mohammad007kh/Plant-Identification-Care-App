import { z } from 'zod';
import {
  comparisonResultSchema,
  deletionStatusResponseSchema,
  problemSchema,
  scanJobSchema,
  type DeletionStatusResponse,
  type Problem,
} from 'shared';
import { isBrowserOffline, mapErrorCode, type MappedError } from './error-map';

export { mapErrorCode, isBrowserOffline };
export type { MappedError };

/**
 * Base URL for the backend API (same convention as the per-feature API
 * modules, e.g. `features/scan/api/scans-api.ts`).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/**
 * Thrown by `apiFetch` for any non-2xx response OR a transport-level failure
 * (fetch itself throwing — DNS failure, connection refused, aborted, no
 * network). Carries the parsed RFC7807 Problem (when the server returned
 * one) plus the localized Persian mapping so callers can render a clear
 * message + retry affordance without re-deriving it (T-161/FR-030).
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly problem: Problem | null;
  readonly mapped: MappedError;

  constructor(status: number | null, problem: Problem | null) {
    // `status === null` means the request never reached the server at all
    // (offline / DNS / connection refused) — treat that the same as the
    // backend's own `offline` code so the UI shows one consistent message.
    const code = problem?.code ?? (status === null ? 'offline' : undefined);
    const mapped = mapErrorCode(code);
    super(mapped.message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.mapped = mapped;
  }
}

async function parseProblem(response: Response): Promise<Problem | null> {
  try {
    const body: unknown = await response.json();
    const result = problemSchema.safeParse(body);
    return result.success ? result.data : null;
  } catch {
    return null; // body wasn't JSON, or wasn't a Problem — status-only ApiError.
  }
}

/**
 * Central fetch wrapper (T-161/FR-030): applies the shared `Problem.code` →
 * Persian message mapping to every non-2xx response and to a fetch-level
 * transport failure, via `ApiError`.
 *
 * Deliberately does NOT auto-retry: retrying here would fire a second
 * network call the caller didn't ask for, and for a POST without an
 * idempotency key that risks a double side effect (e.g. a double credit
 * debit) — see the outbound-retry safety note in
 * `backend/src/common/http/outbound.ts`. Instead this exposes
 * `ApiError.mapped.retryable` so the caller can render a manual retry
 * action, the same pattern `PlantList` already uses with
 * `query.refetch()`.
 *
 * New call sites should prefer this over a raw `fetch`; existing
 * per-feature API modules (`scans-api.ts`, `plants-api.ts`, ...) keep their
 * own local error handling — migrating them is out of scope for this task.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  parse: (body: unknown) => T = (body) => body as T,
): Promise<T> {
  if (isBrowserOffline()) {
    throw new ApiError(null, null);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    // fetch() itself threw: DNS failure, connection refused, CORS, aborted...
    throw new ApiError(null, null);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseProblem(response));
  }

  return parse(await response.json());
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** `POST/DELETE/GET /v1/account/deletion` all share this path (US8, FR-023, T-130). */
const ACCOUNT_DELETION_PATH = '/v1/account/deletion';

/**
 * `POST /v1/account/deletion` — requests account deletion, starting the
 * 7-day grace period (US8, FR-023). Never performs the destructive purge
 * itself: only a backend-scheduled job does that once the grace period
 * elapses. Resolves with the resulting `deletionStatus` (`pending_deletion`)
 * and `purgeScheduledFor` so the caller can show the grace deadline
 * immediately, without a second round trip.
 */
export async function requestAccountDeletion(accessToken: string): Promise<DeletionStatusResponse> {
  return apiFetch(
    ACCOUNT_DELETION_PATH,
    { method: 'POST', headers: authHeaders(accessToken), credentials: 'include' },
    (body) => deletionStatusResponseSchema.parse(body),
  );
}

/**
 * `DELETE /v1/account/deletion` — cancels a pending deletion request. Per the
 * domain rule, cancelling must restore the normal UI immediately; this
 * resolves with the resulting `active` status so the caller can update its
 * local state without waiting on a fresh `GET`.
 */
export async function cancelAccountDeletion(accessToken: string): Promise<DeletionStatusResponse> {
  return apiFetch(
    ACCOUNT_DELETION_PATH,
    { method: 'DELETE', headers: authHeaders(accessToken), credentials: 'include' },
    (body) => deletionStatusResponseSchema.parse(body),
  );
}

/**
 * `GET /v1/account/deletion` — the caller's current deletion status
 * (`active` | `pending_deletion` | `purged`) plus the scheduled purge date,
 * if any (US8, FR-023).
 */
export async function getAccountDeletionStatus(
  accessToken: string,
): Promise<DeletionStatusResponse> {
  return apiFetch(
    ACCOUNT_DELETION_PATH,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => deletionStatusResponseSchema.parse(body),
  );
}

/**
 * `ScanJob` extended with the nested comparison verdict (US5/FR-011). The
 * shared `scanJobSchema` (`shared/src/contracts/scan.ts`) does not carry this
 * field yet — exposing it end-to-end on `GET /v1/scans/:id` is T-107's wiring
 * task — so this task's embedded API contract (`result: { verdict,
 * referencedPhotoIds }`) is modeled here as a local extension rather than by
 * editing the shared package. `result` is present only once a `comparison`
 * scan resolves with a computed verdict; a completed scan with fewer than two
 * photos (FR-011 "follow-up needed") or a failed one omits it and relies on
 * the base `message` field instead.
 */
const comparisonScanJobSchema = scanJobSchema.extend({
  result: comparisonResultSchema.nullable().optional(),
});
export type ComparisonScanJob = z.infer<typeof comparisonScanJobSchema>;

/**
 * `POST /v1/plants/:id/photos` — submits a follow-up photo for health-trend
 * comparison against a saved plant's prior photos (US5, FR-011, T-060).
 * Requires an authenticated session; the backend enqueues an async
 * `comparison` scan job and responds `202 Accepted` with `status: 'pending'`
 * — the caller polls `getScanJob` for the terminal result.
 */
export async function submitFollowUpPhoto(
  accessToken: string,
  plantId: string,
  photo: File,
): Promise<ComparisonScanJob> {
  const formData = new FormData();
  formData.append('photo', photo);

  return apiFetch<ComparisonScanJob>(
    `/v1/plants/${plantId}/photos`,
    { method: 'POST', headers: authHeaders(accessToken), credentials: 'include', body: formData },
    (body) => comparisonScanJobSchema.parse(body),
  );
}

/**
 * `GET /v1/scans/:id` — polls a scan job (identify or comparison) to its
 * terminal status (T-100). Parsed with the comparison-aware schema so a
 * `result` verdict survives parsing when present; identify-type jobs simply
 * omit that field. The route itself carries no auth guard server-side
 * (`ScansController`), matching the sibling `scan` feature's `getScan` —
 * kept as an independent implementation here (routed through the shared
 * `apiFetch` wrapper) so the `comparison` feature does not reach into
 * `features/scan`'s internals.
 */
export async function getScanJob(scanId: string): Promise<ComparisonScanJob> {
  return apiFetch<ComparisonScanJob>(`/v1/scans/${scanId}`, {}, (body) =>
    comparisonScanJobSchema.parse(body),
  );
}
