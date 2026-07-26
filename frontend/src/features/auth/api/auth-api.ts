import {
  authTokenResponseSchema,
  loginRequestSchema,
  problemSchema,
  registerRequestSchema,
  type AuthTokenResponse,
  type LoginRequest,
  type RegisterRequest,
} from 'shared';

/**
 * Base URL for the backend API. Empty string keeps requests relative
 * (same-origin, e.g. behind a reverse proxy); set `NEXT_PUBLIC_API_BASE_URL`
 * to point at a separately-hosted backend during local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/**
 * Thrown for any non-2xx response from the auth endpoints. Carries the raw
 * HTTP status and (best-effort) RFC 7807 `detail` from the backend so callers
 * can decide how to translate it into user-facing (Persian) copy — this
 * layer stays transport-only and does not own UI strings.
 */
export class AuthApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(detail ?? `Auth API request failed with status ${status}`);
    this.name = 'AuthApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function throwAuthApiError(response: Response): Promise<never> {
  let detail: string | undefined;

  try {
    const body: unknown = await response.json();
    const problem = problemSchema.safeParse(body);
    detail = problem.success ? problem.data.detail : undefined;
  } catch {
    // Response body wasn't valid JSON (or wasn't a Problem) — fall back to status only.
    detail = undefined;
  }

  throw new AuthApiError(response.status, detail);
}

async function postAuthRequest(path: string, payload: unknown): Promise<AuthTokenResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The refresh token rides in an httpOnly cookie the backend sets on this
    // response; `credentials: 'include'` is required for the browser to
    // store/send it (and for CORS setups where API + web are cross-origin).
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await throwAuthApiError(response);
  }

  return authTokenResponseSchema.parse(await response.json());
}

/**
 * `POST /v1/auth/register` — email/password only (FR-007, no third-party
 * option in v1). Merges the guest session's prior scans server-side (T-041).
 */
export async function register(payload: RegisterRequest): Promise<AuthTokenResponse> {
  const parsed = registerRequestSchema.parse(payload);
  return postAuthRequest('/v1/auth/register', parsed);
}

/** `POST /v1/auth/login` — email/password. */
export async function login(payload: LoginRequest): Promise<AuthTokenResponse> {
  const parsed = loginRequestSchema.parse(payload);
  return postAuthRequest('/v1/auth/login', parsed);
}
