import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsEventName, AnalyticsEventProps } from 'shared';
import { AnalyticsRepository } from './analytics.repository';

/**
 * `track()`'s second argument: the same scalar-only prop bag as the shared
 * contract, plus the reserved `userId` key — extracted into the dedicated
 * `analytics_event.user_id` column instead of being stored inside `props`
 * (Station 16: "user id reference, event type, numeric props, timestamp
 * UTC"). Omit it (or pass `null`) for guest-attributed events.
 */
export type TrackProps = AnalyticsEventProps & { userId?: string | null };

/**
 * Prop keys that are obviously PII-shaped and must never reach
 * `analytics_event.props` (defense-in-depth on top of the type-level
 * scalar-only constraint — a caller could still pass e.g. `email: 'a@b.com'`
 * as a string and satisfy the type checker).
 */
const PII_PROP_KEYS = new Set([
  'email',
  'phone',
  'phonenumber',
  'name',
  'fullname',
  'firstname',
  'lastname',
  'photo',
  'photobytes',
  'image',
  'address',
  'ip',
  'ipaddress',
  'password',
]);

/**
 * Single non-blocking analytics emit point (FR-028, Station 16 — Analytics).
 * `track()` NEVER throws and NEVER lets a persistence failure propagate to
 * the caller — a tracking failure must never break a scan, a payment, or any
 * other user action. It is safe to call without awaiting
 * (`void this.analytics.track(...)`) on latency-sensitive paths; the
 * returned promise only exists so tests/callers that DO want to await
 * completion (e.g. before process exit) can.
 *
 * NOT registered anywhere yet — `AnalyticsModule` is `@Global()` but Nest
 * still requires it to be imported once in the module tree (conventionally
 * `app.module.ts`) for global providers to resolve. That import is a wiring
 * step performed separately from this task (see T-160 completion notes).
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly repository: AnalyticsRepository) {}

  async track(event: AnalyticsEventName, props: TrackProps = {}): Promise<void> {
    try {
      const { userId = null, ...rest } = props;
      this.assertNoPii(rest);
      await this.repository.insertEvent({ userId, name: event, props: rest });
    } catch (err) {
      // Swallow-and-log: analytics is best-effort observability, never a hard
      // dependency of the calling feature. Structured log per
      // `error_handling.logging` (registry).
      this.logger.warn(
        `analytics track failed for event "${event}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Rejects (by throwing, caught by `track`) a payload carrying an obviously-PII key. */
  private assertNoPii(props: Record<string, unknown>): void {
    for (const key of Object.keys(props)) {
      if (PII_PROP_KEYS.has(key.toLowerCase())) {
        throw new Error(`analytics prop "${key}" looks like PII and was rejected`);
      }
    }
  }
}
