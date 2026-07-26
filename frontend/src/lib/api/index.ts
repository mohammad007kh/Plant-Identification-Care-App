import { problemSchema, type Problem } from 'shared';
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
