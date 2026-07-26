import { cursorPageSchema, plantSchema, problemSchema, type Plant } from 'shared';

/**
 * Base URL for the backend API. Empty string keeps requests relative
 * (same-origin, e.g. behind a reverse proxy); set `NEXT_PUBLIC_API_BASE_URL`
 * to point at a separately-hosted backend during local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const plantsPageSchema = cursorPageSchema(plantSchema);

/** `GET /v1/plants` response envelope (mirrors OpenAPI `CursorPage<Plant>`). */
export interface PlantsPage {
  data: Plant[];
  nextCursor: string | null;
}

export interface ListPlantsParams {
  /** Opaque, server-generated cursor — never parsed/constructed by the client. */
  cursor?: string;
  /** Defaults to 20 server-side; capped at 100 (`T-060` `listPlantsQuerySchema`). */
  limit?: number;
}

/**
 * Thrown for any non-2xx response from the plants endpoints. Carries the raw
 * HTTP status and (best-effort) RFC 7807 `detail` from the backend so callers
 * can decide how to translate it into user-facing (Persian) copy — this
 * layer stays transport-only and does not own UI strings.
 */
export class PlantsApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(detail ?? `Plants API request failed with status ${status}`);
    this.name = 'PlantsApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function throwPlantsApiError(response: Response): Promise<never> {
  let detail: string | undefined;

  try {
    const body: unknown = await response.json();
    const problem = problemSchema.safeParse(body);
    detail = problem.success ? problem.data.detail : undefined;
  } catch {
    // Response body wasn't valid JSON (or wasn't a Problem) — fall back to status only.
    detail = undefined;
  }

  throw new PlantsApiError(response.status, detail);
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * `GET /v1/plants` — cursor-paginated list of the caller's saved plants
 * (US3, FR-009). Every plants endpoint requires an authenticated session;
 * `accessToken` is read from the Zustand auth store by the calling hook, not
 * here, so this transport layer stays store-agnostic and unit-testable in
 * isolation. `credentials: 'include'` is required so the browser sends the
 * httpOnly refresh-token cookie alongside the bearer access token.
 */
export async function listPlants(
  accessToken: string,
  params: ListPlantsParams = {},
): Promise<PlantsPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();

  const response = await fetch(`${API_BASE_URL}/v1/plants${queryString ? `?${queryString}` : ''}`, {
    headers: authHeaders(accessToken),
    credentials: 'include',
  });

  if (!response.ok) {
    await throwPlantsApiError(response);
  }

  return plantsPageSchema.parse(await response.json());
}

/** `GET /v1/plants/:id` — fetches a single saved plant with its photo history. */
export async function getPlant(accessToken: string, plantId: string): Promise<Plant> {
  const response = await fetch(`${API_BASE_URL}/v1/plants/${plantId}`, {
    headers: authHeaders(accessToken),
    credentials: 'include',
  });

  if (!response.ok) {
    await throwPlantsApiError(response);
  }

  return plantSchema.parse(await response.json());
}
