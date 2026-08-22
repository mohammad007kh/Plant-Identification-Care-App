import { problemSchema, scanJobSchema, type ScanJob } from 'shared';

/**
 * Base URL for the backend API. Empty string keeps requests relative
 * (same-origin, e.g. behind a reverse proxy); set `NEXT_PUBLIC_API_BASE_URL`
 * to point at a separately-hosted backend during local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/**
 * Thrown for any non-2xx response from the scans endpoints. Carries the raw
 * HTTP status and (best-effort) RFC 7807 `detail` from the backend so callers
 * can decide how to translate it into user-facing (Persian) copy — this
 * layer stays transport-only and does not own UI strings.
 */
export class ScanApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(detail ?? `Scan API request failed with status ${status}`);
    this.name = 'ScanApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function throwScanApiError(response: Response): Promise<never> {
  let detail: string | undefined;

  try {
    const body: unknown = await response.json();
    const problem = problemSchema.safeParse(body);
    detail = problem.success ? problem.data.detail : undefined;
  } catch {
    // Response body wasn't valid JSON (or wasn't a Problem) — fall back to status only.
    detail = undefined;
  }

  throw new ScanApiError(response.status, detail);
}

/**
 * `POST /v1/scans` — submits a single leaf photo (multipart, field name
 * `photo`) for identification. Returns the freshly-created `ScanJob` with
 * `status: 'pending'` (202 Accepted); the caller polls `getScan` for the
 * terminal result.
 *
 * @param idempotencyKey Fresh UUID per submission — required for
 *   authenticated requests and harmless (ignored) for guest requests, so it
 *   is always sent.
 */
export async function createScan(photo: File, idempotencyKey: string): Promise<ScanJob> {
  const formData = new FormData();
  formData.append('photo', photo);

  const response = await fetch(`${API_BASE_URL}/v1/scans`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    // Required so the browser STORES the httpOnly `guest-id` cookie the backend
    // sets on the first scan (and SENDS it on later ones). Without it every
    // UI-driven guest scan looks like a brand-new guest, so the server-side
    // 2-scan limit (FR-006) never triggers the registration wall — the bug the
    // guest-limit E2E journey caught. Also carries the Bearer/refresh session
    // for a logged-in scanner, consistent with every other `*-api` module.
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    await throwScanApiError(response);
  }

  return scanJobSchema.parse(await response.json());
}

/** `GET /v1/scans/:id` — fetches the current status/result of a scan job. */
export async function getScan(scanId: string): Promise<ScanJob> {
  // Same guest/auth session propagation as `createScan` above (the poll must be
  // recognized as the same guest/user that created the scan).
  const response = await fetch(`${API_BASE_URL}/v1/scans/${scanId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    await throwScanApiError(response);
  }

  return scanJobSchema.parse(await response.json());
}
