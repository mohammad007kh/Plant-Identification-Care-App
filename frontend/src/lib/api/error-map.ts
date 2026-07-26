import { defaultLocale, getMessages } from '@/i18n';

/**
 * Codes classified/emitted by the backend's `common/errors/error-codes.ts`
 * (T-161/FR-030) that this map knows how to translate. Kept as a local
 * mirror rather than a cross-package import: the frontend and backend are
 * separate runtimes, and `Problem.code` (the shared `contracts` schema) is
 * already a plain optional string, so nothing forces the two lists to be the
 * same TypeScript type — only the string VALUES need to line up, which the
 * fa.json message keys below make obvious if either side drifts.
 */
const RETRYABLE_CODES = new Set<string>([
  'ai_unavailable',
  'upstream_timeout',
  'upstream_unavailable',
  'database_unavailable',
  'offline',
]);

export interface MappedError {
  /** Localized (Persian) message ready to render as-is. */
  message: string;
  /** Whether the UI should offer a retry action for this failure. */
  retryable: boolean;
  /** The original code, or null when the response carried none. */
  code: string | null;
}

/**
 * Maps an RFC7807 `Problem.code` to a localized Persian message + whether a
 * retry affordance makes sense. An absent or unrecognized code (any
 * non-connectivity `HttpException` the backend already handles with its own
 * message, e.g. validation errors) falls back to a generic Persian message —
 * the UI must never surface a raw English error string (FR-030).
 */
export function mapErrorCode(code: string | null | undefined): MappedError {
  const catalog = getMessages(defaultLocale).errors.codes as Record<string, string>;
  const message = (code && catalog[code]) || catalog.generic;
  return {
    message,
    retryable: code ? RETRYABLE_CODES.has(code) : true,
    code: code ?? null,
  };
}

/** True when the browser itself currently has no network connectivity. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
