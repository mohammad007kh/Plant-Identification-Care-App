import { z } from 'zod';
import {
  adminConfigSchema,
  adminMisidentificationReportListResponseSchema,
  adminSpeciesSchema,
  adminTierSchema,
  adminUserActionRequestSchema,
  adminUserListResponseSchema,
  adminUserSummarySchema,
  comparisonResultSchema,
  createSpeciesRequestSchema,
  deletionStatusResponseSchema,
  notificationPreferencesSchema,
  problemSchema,
  scanJobSchema,
  updateAdminConfigRequestSchema,
  updateNotificationPreferencesRequestSchema,
  updateSpeciesRequestSchema,
  updateTierRequestSchema,
  webPushSubscriptionSchema,
  type AdminConfig,
  type AdminMisidentificationReportListResponse,
  type AdminSpecies,
  type AdminTier,
  type AdminUserActionRequest,
  type AdminUserListResponse,
  type AdminUserSummary,
  type CreateSpeciesRequest,
  type DeletionStatusResponse,
  type NotificationPreferences,
  type Problem,
  type UpdateAdminConfigRequest,
  type UpdateNotificationPreferencesRequest,
  type UpdateSpeciesRequest,
  type UpdateTierRequest,
  type WebPushSubscriptionRequest,
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

// --- Chat (US6, FR-012/FR-013, T-111) ---------------------------------------
// Appended rather than merged into the imports/functions above so this file
// stays a low-conflict-risk append target for other in-flight tasks (per
// T-111's embedded instructions) — a separate `import` statement is valid
// anywhere in an ES module (hoisted), so it does not require touching the
// existing import block at the top of the file.
import {
  chatMessageRequestSchema,
  chatMessageSchema,
  cursorPageSchema,
  type ChatMessage,
  type ChatMessageRequest,
} from 'shared';

const chatMessagesPageSchema = cursorPageSchema(chatMessageSchema);

/** `GET /v1/plants/:id/chat/messages` response envelope (mirrors OpenAPI `CursorPage<ChatMessage>`). */
export interface ChatMessagesPage {
  data: ChatMessage[];
  nextCursor: string | null;
}

export interface ListChatMessagesParams {
  /** Opaque, server-generated cursor — never parsed/constructed by the client. */
  cursor?: string;
  /** Defaults to 20 server-side (mirrors `listPlants`'s convention). */
  limit?: number;
}

/**
 * `GET /v1/plants/:id/chat/messages` — cursor-paginated chat history for a
 * saved plant (US6, FR-012/FR-013, T-110). The `chat` feature's `useChat`
 * hook treats the FIRST page fetched (no cursor) as the most recent window of
 * messages; a `nextCursor` on that response points further back in time, so
 * "load older messages" fetches progressively earlier pages — the reverse
 * direction from `listPlants`'s forward-only pagination.
 */
export async function listChatMessages(
  accessToken: string,
  plantId: string,
  params: ListChatMessagesParams = {},
): Promise<ChatMessagesPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();

  return apiFetch<ChatMessagesPage>(
    `/v1/plants/${plantId}/chat/messages${queryString ? `?${queryString}` : ''}`,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => chatMessagesPageSchema.parse(body),
  );
}

/**
 * Ack body for `POST /v1/plants/:id/chat` (US6, FR-012/FR-013, T-110). This
 * task's embedded API contract specifies only the status codes (202
 * accepted / 402 out-of-credit) and no response schema, so this is modeled as
 * a permissive placeholder — the same documented-local-extension approach
 * `ComparisonScanJob` above uses for its own T-110-adjacent gap. Wiring the
 * exact accepted-body shape end-to-end is that task's concern, not this one's.
 */
const chatSendResponseSchema = z.object({}).passthrough();
export type ChatSendResponse = z.infer<typeof chatSendResponseSchema>;

/**
 * `POST /v1/plants/:id/chat` — sends a chat message about a saved plant,
 * optionally attaching up to 2 of its photos as context (US6, FR-012). Every
 * non-2xx response — including the FR-013 Free-tier/out-of-credit 402 —
 * surfaces as an `ApiError`; the caller (`useChat`) special-cases
 * `status === 402` into the upgrade modal rather than a generic error message.
 */
export async function sendChatMessage(
  accessToken: string,
  plantId: string,
  payload: ChatMessageRequest,
): Promise<ChatSendResponse> {
  const parsed = chatMessageRequestSchema.parse(payload);

  return apiFetch<ChatSendResponse>(
    `/v1/plants/${plantId}/chat`,
    {
      method: 'POST',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => chatSendResponseSchema.parse(body),
  );
}

/** `GET/PATCH /v1/account/notifications` share this path (US7, FR-022, T-120). */
const NOTIFICATION_PREFERENCES_PATH = '/v1/account/notifications';

/**
 * `GET /v1/account/notifications` — the caller's current email/push
 * care-reminder toggles (US7, FR-022, T-121).
 */
export async function getNotificationPreferences(
  accessToken: string,
): Promise<NotificationPreferences> {
  return apiFetch(
    NOTIFICATION_PREFERENCES_PATH,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => notificationPreferencesSchema.parse(body),
  );
}

/**
 * `PATCH /v1/account/notifications` — updates one or both channel toggles
 * (US7, FR-022, T-121). Resolves with the resulting preferences so the
 * caller's optimistic cache write can be reconciled against the
 * server-confirmed value.
 */
export async function updateNotificationPreferences(
  accessToken: string,
  patch: UpdateNotificationPreferencesRequest,
): Promise<NotificationPreferences> {
  const parsed = updateNotificationPreferencesRequestSchema.parse(patch);

  return apiFetch(
    NOTIFICATION_PREFERENCES_PATH,
    {
      method: 'PATCH',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => notificationPreferencesSchema.parse(body),
  );
}

/**
 * `POST /v1/account/push-subscription` — registers a best-effort web-push
 * subscription (US7, FR-020, T-121). The backend responds `204 No Content`
 * on success (`NotificationsController.registerPushSubscription`), so this
 * bypasses `apiFetch`'s `parse` step (which always calls `response.json()`
 * and would throw on an empty body) while still reusing its error
 * conventions (`ApiError`, the offline short-circuit, the RFC7807 `Problem`
 * parse).
 */
export async function registerPushSubscription(
  accessToken: string,
  subscription: WebPushSubscriptionRequest,
): Promise<void> {
  const parsed = webPushSubscriptionSchema.parse(subscription);

  if (isBrowserOffline()) {
    throw new ApiError(null, null);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/account/push-subscription`, {
      method: 'POST',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(parsed),
    });
  } catch {
    throw new ApiError(null, null);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseProblem(response));
  }
}

// --- Admin panel (US9, FR-024/FR-025/FR-026/FR-027, T-140/T-141) ---
//
// All `/v1/admin/*` routes require an authenticated `role=admin` session; the
// backend `AdminGuard` (T-140/T-141) is the real enforcement boundary — the
// frontend's own role check (`features/admin/lib/get-role-from-token.ts`) is
// UX only. Every function below shares the `apiFetch` + JSON content-type +
// `credentials: 'include'` convention already used by the notification/
// account-deletion admin-adjacent calls above.

const adminSpeciesListSchema = z.array(adminSpeciesSchema);
const adminTierListSchema = z.array(adminTierSchema);

function jsonHeaders(accessToken: string): HeadersInit {
  return { ...authHeaders(accessToken), 'Content-Type': 'application/json' };
}

/** `GET /v1/admin/species` — the full species catalog (FR-024). */
export async function listAdminSpecies(accessToken: string): Promise<AdminSpecies[]> {
  return apiFetch(
    '/v1/admin/species',
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminSpeciesListSchema.parse(body),
  );
}

/** `POST /v1/admin/species` — creates a new catalog species (FR-024). */
export async function createAdminSpecies(
  accessToken: string,
  payload: CreateSpeciesRequest,
): Promise<AdminSpecies> {
  const parsed = createSpeciesRequestSchema.parse(payload);

  return apiFetch(
    '/v1/admin/species',
    {
      method: 'POST',
      headers: jsonHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => adminSpeciesSchema.parse(body),
  );
}

/** `PATCH /v1/admin/species/:publicId` — updates a catalog species + care guide (FR-024). */
export async function updateAdminSpecies(
  accessToken: string,
  publicId: string,
  payload: UpdateSpeciesRequest,
): Promise<AdminSpecies> {
  const parsed = updateSpeciesRequestSchema.parse(payload);

  return apiFetch(
    `/v1/admin/species/${publicId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => adminSpeciesSchema.parse(body),
  );
}

/** `GET /v1/admin/config` — the live operational config (FR-005/FR-021/FR-027). */
export async function getAdminConfig(accessToken: string): Promise<AdminConfig> {
  return apiFetch(
    '/v1/admin/config',
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminConfigSchema.parse(body),
  );
}

/**
 * `PATCH /v1/admin/config` — updates any subset of the config blobs
 * (allowed photo file types / credit costs / notification templates+timing).
 * Each provided blob must fully validate against the same schema the
 * read side parses with (FR-005/FR-021/FR-027).
 */
export async function updateAdminConfig(
  accessToken: string,
  payload: UpdateAdminConfigRequest,
): Promise<AdminConfig> {
  const parsed = updateAdminConfigRequestSchema.parse(payload);

  return apiFetch(
    '/v1/admin/config',
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => adminConfigSchema.parse(body),
  );
}

/** `GET /v1/admin/tiers` — the subscription tier catalog (FR-014/FR-019). */
export async function listAdminTiers(accessToken: string): Promise<AdminTier[]> {
  return apiFetch(
    '/v1/admin/tiers',
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminTierListSchema.parse(body),
  );
}

/**
 * `PATCH /v1/admin/tiers` — updates one tier's allowance/price/active flag,
 * identified by its `key` in the request body (FR-014/FR-019).
 */
export async function updateAdminTier(
  accessToken: string,
  payload: UpdateTierRequest,
): Promise<AdminTier> {
  const parsed = updateTierRequestSchema.parse(payload);

  return apiFetch(
    '/v1/admin/tiers',
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => adminTierSchema.parse(body),
  );
}

export interface ListAdminUsersParams {
  /** Free-text search against email (substring) or an exact `publicId` (FR-026). */
  q?: string;
  /** Opaque, server-generated cursor — never parsed/constructed by the client. */
  cursor?: string;
  /** Defaults to 20 server-side; capped at 100. */
  limit?: number;
}

/** `GET /v1/admin/users` — cursor-paginated user search (FR-026). */
export async function listAdminUsers(
  accessToken: string,
  params: ListAdminUsersParams = {},
): Promise<AdminUserListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();

  return apiFetch(
    `/v1/admin/users${queryString ? `?${queryString}` : ''}`,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminUserListResponseSchema.parse(body),
  );
}

/** `GET /v1/admin/users/:publicId` — a single user's admin-facing detail (FR-026). */
export async function getAdminUser(
  accessToken: string,
  publicId: string,
): Promise<AdminUserSummary> {
  return apiFetch(
    `/v1/admin/users/${publicId}`,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminUserSummarySchema.parse(body),
  );
}

/**
 * `PATCH /v1/admin/users/:publicId` — an administrative account action
 * (tier change and/or credit adjustment), always audited via the required
 * `reason` field (FR-026, Station 17 "actions are audited" rule).
 */
export async function updateAdminUser(
  accessToken: string,
  publicId: string,
  payload: AdminUserActionRequest,
): Promise<AdminUserSummary> {
  const parsed = adminUserActionRequestSchema.parse(payload);

  return apiFetch(
    `/v1/admin/users/${publicId}`,
    {
      method: 'PATCH',
      headers: jsonHeaders(accessToken),
      credentials: 'include',
      body: JSON.stringify(parsed),
    },
    (body) => adminUserSummarySchema.parse(body),
  );
}

export interface ListAdminMisidentificationReportsParams {
  /** Opaque, server-generated cursor — never parsed/constructed by the client. */
  cursor?: string;
  /** Defaults to 20 server-side; capped at 100. */
  limit?: number;
}

/**
 * `GET /v1/admin/misidentification-reports` — cursor-paginated report queue,
 * each with the reported scan's AI-result snapshot + a signed photo URL for
 * review (FR-025). Read-only — there is no admin mutation endpoint for
 * reports in this task's scope.
 */
export async function listAdminMisidentificationReports(
  accessToken: string,
  params: ListAdminMisidentificationReportsParams = {},
): Promise<AdminMisidentificationReportListResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();

  return apiFetch(
    `/v1/admin/misidentification-reports${queryString ? `?${queryString}` : ''}`,
    { headers: authHeaders(accessToken), credentials: 'include' },
    (body) => adminMisidentificationReportListResponseSchema.parse(body),
  );
}
