import { z } from 'zod';

/**
 * Cross-cutting activity-tracking event vocabulary (T-160, FR-028, Station
 * 16 — Analytics). No public endpoint consumes this contract; it exists so
 * every feature module that eventually calls `AnalyticsService.track()`
 * (backend/src/analytics) uses the same event names and a privacy-safe prop
 * shape instead of ad-hoc strings. Covers the minimum FR-028 event coverage:
 * scan attempts, scan success/failure + confidence, registration
 * conversions, subscription tier changes/upgrades, credit consumption, chat
 * usage, and notification delivery/engagement.
 */
export const analyticsEventNameSchema = z.enum([
  'scan.attempted',
  'scan.succeeded',
  'scan.failed',
  'registration.converted',
  'subscription.tier_changed',
  'credit.consumed',
  'chat.message_sent',
  'notification.delivered',
  'notification.engaged',
]);
export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

/**
 * Event payload values MUST be scalar (string/number/boolean/null) — no
 * nested objects, no arrays, no photo bytes. This is the type-level half of
 * the "no PII / minimized payload" privacy rule; `AnalyticsService` enforces
 * the rest (rejects obviously-PII-shaped keys) at runtime.
 */
const analyticsPropValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const analyticsEventPropsSchema = z.record(z.string(), analyticsPropValueSchema);
export type AnalyticsEventProps = z.infer<typeof analyticsEventPropsSchema>;
