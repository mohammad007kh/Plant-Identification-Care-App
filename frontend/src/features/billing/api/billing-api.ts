import { z } from 'zod';
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  creditBalanceSchema,
  planSchema,
  problemSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  type CreditBalance,
  type Plan,
} from 'shared';

/**
 * Base URL for the backend API. Empty string keeps requests relative
 * (same-origin, e.g. behind a reverse proxy); set `NEXT_PUBLIC_API_BASE_URL`
 * to point at a separately-hosted backend during local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

/** `GET /v1/subscriptions/plans` returns a plain array of `Plan` (not a cursor page). */
const plansResponseSchema = z.array(planSchema);

/**
 * Thrown for any non-2xx response from the billing endpoints. Carries the raw
 * HTTP status and (best-effort) RFC 7807 `detail` from the backend so callers
 * can decide how to translate it into user-facing (Persian) copy — this
 * layer stays transport-only and does not own UI strings.
 */
export class BillingApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(detail ?? `Billing API request failed with status ${status}`);
    this.name = 'BillingApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function throwBillingApiError(response: Response): Promise<never> {
  let detail: string | undefined;

  try {
    const body: unknown = await response.json();
    const problem = problemSchema.safeParse(body);
    detail = problem.success ? problem.data.detail : undefined;
  } catch {
    // Response body wasn't valid JSON (or wasn't a Problem) — fall back to status only.
    detail = undefined;
  }

  throw new BillingApiError(response.status, detail);
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * `GET /v1/subscriptions/plans` — the live plan catalog (FR-016, SC-006).
 * Public endpoint (`security: []`), so no `accessToken` parameter — the
 * upgrade modal must render exactly what this returns, never a
 * hardcoded/fallback list.
 */
export async function getPlans(): Promise<Plan[]> {
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/plans`);

  if (!response.ok) {
    await throwBillingApiError(response);
  }

  return plansResponseSchema.parse(await response.json());
}

/**
 * `GET /v1/credits/balance` — the caller's current credit balance + tier.
 * Requires an authenticated session. `credentials: 'include'` is required so
 * the browser sends the httpOnly refresh-token cookie alongside the bearer
 * access token.
 */
export async function getCreditBalance(accessToken: string): Promise<CreditBalance> {
  const response = await fetch(`${API_BASE_URL}/v1/credits/balance`, {
    headers: authHeaders(accessToken),
    credentials: 'include',
  });

  if (!response.ok) {
    await throwBillingApiError(response);
  }

  return creditBalanceSchema.parse(await response.json());
}

/**
 * `POST /v1/payments/checkout` — starts the mock-Zarinpal checkout redirect
 * flow for the given plan (T-081). Resolves with the gateway `redirectUrl`;
 * this transport layer never triggers navigation itself — that is the
 * caller's (`UpgradeModal`'s) responsibility.
 */
export async function checkout(
  accessToken: string,
  payload: CheckoutRequest,
): Promise<CheckoutResponse> {
  const parsed = checkoutRequestSchema.parse(payload);

  const response = await fetch(`${API_BASE_URL}/v1/payments/checkout`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(parsed),
  });

  if (!response.ok) {
    await throwBillingApiError(response);
  }

  return checkoutResponseSchema.parse(await response.json());
}
