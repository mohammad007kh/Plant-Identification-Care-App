import { z } from 'zod';

/**
 * Care-reminder preference + push-subscription contracts (T-120, US7,
 * FR-020/FR-021/FR-022). Backs `GET/PATCH /v1/account/notifications` and
 * `POST /v1/account/push-subscription`. Email is the guaranteed primary
 * channel; web push is best-effort/secondary — see `backend/src/notifications`.
 */

/** Mirrors `users.notif_email_enabled` / `users.notif_push_enabled` (T-010). */
export const notificationPreferencesSchema = z.object({
  notifEmailEnabled: z.boolean(),
  notifPushEnabled: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** PATCH body: any subset of the two toggles, but at least one. */
export const updateNotificationPreferencesRequestSchema = notificationPreferencesSchema
  .partial()
  .refine((v) => v.notifEmailEnabled !== undefined || v.notifPushEnabled !== undefined, {
    message: 'at least one of notifEmailEnabled/notifPushEnabled is required',
  });
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;

/** A W3C `PushSubscriptionJSON`-shaped browser subscription (best-effort, VAPID). */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});
export type WebPushSubscriptionRequest = z.infer<typeof webPushSubscriptionSchema>;
