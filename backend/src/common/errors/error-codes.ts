/**
 * Stable RFC7807 `code` vocabulary for connectivity / service-failure
 * responses (FR-030, T-161). Both `ProblemDetailsFilter` (backend) and the
 * frontend's error-code → Persian message map (`frontend/src/lib/api/error-map.ts`)
 * key off these same string values, so a code added here must be mirrored
 * there to get a translated message instead of a generic fallback.
 *
 * A plain string-literal union (not a TS `enum`) per the project's TypeScript
 * conventions — `ErrorCode` is usable both as a value namespace (`ErrorCode.AI_UNAVAILABLE`)
 * and as a type (`ErrorCode`).
 */
export const ErrorCode = {
  /** The AI provider (OpenAI/LangChain) could not complete the request. */
  AI_UNAVAILABLE: 'ai_unavailable',
  /** An outbound call (AI, SMTP, payment, ...) exceeded its timeout budget. */
  UPSTREAM_TIMEOUT: 'upstream_timeout',
  /** A non-AI upstream dependency (generic) is unreachable or erroring. */
  UPSTREAM_UNAVAILABLE: 'upstream_unavailable',
  /** The database connection/pool is unreachable. */
  DATABASE_UNAVAILABLE: 'database_unavailable',
  /** Frontend-only: the client itself has no network connectivity. */
  OFFLINE: 'offline',
  /** Fallback for anything that isn't a known connectivity/outage failure. */
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

/** Node/network-level errno codes that indicate a dependency is unreachable. */
const CONNECTIVITY_ERRNO_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

function hasConnectivityErrno(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  const errno = (exception as NodeJS.ErrnoException).code;
  return typeof errno === 'string' && CONNECTIVITY_ERRNO_CODES.has(errno);
}

/**
 * Classifies an exception that reached the global filter WITHOUT its own
 * typed `code` (i.e. not a Nest `HttpException` body carrying `{ code }`)
 * into a stable `ErrorCode`. Used for the two shapes that matter for
 * graceful degradation:
 *   1. `OutboundServiceError` (backend/src/common/http/outbound.ts) — already
 *      carries the right code on `.code`, so this just reads it through.
 *   2. Raw driver/network errors (e.g. `pg` connection failures) that were
 *      never wrapped — detected by their Node errno `code`.
 * Anything else falls back to `internal_error` (today's behavior, unchanged).
 */
export function classifyUpstreamError(exception: unknown): ErrorCode {
  const carriedCode = (exception as { code?: unknown } | null)?.code;
  if (isErrorCode(carriedCode)) {
    return carriedCode;
  }
  if (hasConnectivityErrno(exception)) {
    return ErrorCode.DATABASE_UNAVAILABLE;
  }
  return ErrorCode.INTERNAL_ERROR;
}

/** Codes that represent a temporary outage — the client should retry later. */
const OUTAGE_CODES: ReadonlySet<ErrorCode> = new Set([
  ErrorCode.AI_UNAVAILABLE,
  ErrorCode.UPSTREAM_TIMEOUT,
  ErrorCode.UPSTREAM_UNAVAILABLE,
  ErrorCode.DATABASE_UNAVAILABLE,
]);

export function isOutageCode(code: ErrorCode): boolean {
  return OUTAGE_CODES.has(code);
}
