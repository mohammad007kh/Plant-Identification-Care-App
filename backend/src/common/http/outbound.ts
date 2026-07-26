import { Logger } from '@nestjs/common';
import { ErrorCode } from '../errors/error-codes';

/**
 * Thrown by `callOutboundService` when every attempt at an outbound call
 * (AI provider, SMTP, payment gateway, ...) fails or times out. Carries a
 * stable `code` so `ProblemDetailsFilter` (via `classifyUpstreamError`) can
 * map it to the right RFC7807 response without re-parsing the message.
 */
export class OutboundServiceError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'OutboundServiceError';
    this.code = code;
    this.cause = cause;
  }
}

/** Internal marker so `callOutboundService` can tell "timed out" apart from "rejected". */
class OutboundTimeoutMarker extends Error {}

export interface CircuitBreakerOptions {
  /** Consecutive failures required to open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before allowing a half-open probe. */
  resetTimeoutMs: number;
}

/**
 * Minimal consecutive-failure circuit breaker for a single outbound
 * dependency. Per-instance state only (no module-level singleton) — each
 * caller (e.g. `AiGatewayService`) owns one, so it lives and dies with that
 * provider's DI lifetime and never leaks state across unrelated callers or
 * test instances.
 *
 * Behavior: after `failureThreshold` consecutive failures the circuit opens
 * and `isOpen` is true for `resetTimeoutMs`, causing `callOutboundService` to
 * fail fast (no network call) instead of hammering an already-down
 * dependency. Once the window elapses, the next call is a "half-open" probe:
 * success closes the circuit, failure re-opens it for another window.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      return false; // reset window elapsed — allow a half-open probe
    }
    return true;
  }

  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.openedAt = Date.now();
    }
  }
}

export interface OutboundCallOptions {
  /** Human-readable name for log lines and the fail-fast/timeout messages. */
  label: string;
  /** Wall-clock timeout applied to EACH attempt. */
  timeoutMs: number;
  /** Total attempts, including the first (2 = one retry). */
  maxAttempts: number;
  /** Base backoff in ms between attempts; actual delay = base * 2^(attempt-1). Default 200ms. */
  backoffBaseMs?: number;
  /** Code used when attempts are exhausted for a non-timeout failure (e.g. `ai_unavailable`). */
  unavailableCode: ErrorCode;
  /** Optional per-caller circuit breaker; when open, fails fast without invoking `fn`. */
  breaker?: CircuitBreaker;
}

const logger = new Logger('OutboundCall');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new OutboundTimeoutMarker(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Shared timeout + retry-with-backoff (+ optional circuit breaker) wrapper
 * for any outbound call to an external dependency (AI provider today; SMTP/
 * payment adapters can adopt the same wrapper when they make real network
 * calls). Retrying here is only safe because every current caller sits
 * behind `CreditsService.runMeteredAction`'s reserve/refund — a final
 * failure after retries still refunds the reserved credit (FR-017); this
 * wrapper never retries a call whose caller lacks that protection.
 *
 * On success: resets the breaker (if any) and returns the value.
 * On failure: every attempt records a breaker failure; once attempts are
 * exhausted, throws `OutboundServiceError` with `code: 'upstream_timeout'`
 * for a timed-out last attempt, or the caller-supplied `unavailableCode`
 * otherwise (message preserved from the underlying error so callers/tests
 * that assert on it keep working).
 */
export async function callOutboundService<T>(
  fn: () => Promise<T>,
  options: OutboundCallOptions,
): Promise<T> {
  const { label, timeoutMs, maxAttempts, backoffBaseMs = 200, unavailableCode, breaker } = options;

  if (breaker?.isOpen) {
    throw new OutboundServiceError(
      unavailableCode,
      `${label} is unavailable (circuit open after repeated failures)`,
    );
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await withTimeout(fn, timeoutMs, label);
      breaker?.onSuccess();
      return result;
    } catch (err) {
      lastError = err;
      breaker?.onFailure();
      logger.warn(`${label} call failed (attempt ${attempt}/${maxAttempts}): ${errorMessage(err)}`);
      if (attempt < maxAttempts) {
        await sleep(backoffBaseMs * 2 ** (attempt - 1));
      }
    }
  }

  if (lastError instanceof OutboundTimeoutMarker) {
    throw new OutboundServiceError(ErrorCode.UPSTREAM_TIMEOUT, lastError.message, lastError);
  }
  throw new OutboundServiceError(unavailableCode, errorMessage(lastError), lastError);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
