import { webPushSubscriptionSchema, type WebPushSubscriptionRequest } from 'shared';
import { registerPushSubscription } from '@/lib/api';

/**
 * Result of a best-effort push opt-in attempt (US7, FR-020/FR-030). Never
 * throws — every failure mode (unsupported browser, denied permission, no
 * active service worker, a rejected `POST /v1/account/push-subscription`)
 * resolves to a distinct, typed outcome so the caller can show a precise
 * message while the email channel keeps working regardless (domain rule).
 */
export type PushSubscribeResult =
  | { status: 'subscribed' }
  | { status: 'unsupported' }
  | { status: 'permission-denied' }
  | { status: 'error'; error: unknown };

/**
 * Feature-detects the minimum browser APIs a push subscription needs
 * (`Notification`, `serviceWorker`, `PushManager`). Checked before ever
 * prompting the user so an unsupported browser degrades straight to
 * email-only without a permission prompt that could never succeed.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** Converts the VAPID public key (base64url, per the `web-push` convention) to the raw `ArrayBuffer` `PushManager.subscribe` expects as `applicationServerKey`. */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  // `new Uint8Array(length)` always allocates a plain `ArrayBuffer` (never a
  // `SharedArrayBuffer`), but the DOM lib types `.buffer` as the broader
  // `ArrayBufferLike` — this cast narrows back to what's actually there.
  return outputArray.buffer as ArrayBuffer;
}

function toSubscriptionRequest(subscription: PushSubscription): WebPushSubscriptionRequest {
  const json = subscription.toJSON();
  return webPushSubscriptionSchema.parse({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    expirationTime: subscription.expirationTime ?? null,
  });
}

/**
 * Resolves the active service worker registration to subscribe through.
 *
 * No app-wide service worker is registered in this codebase yet (that is a
 * separate PWA task) — `navigator.serviceWorker.ready` would otherwise hang
 * forever waiting for one to appear, turning "best-effort" into a stuck
 * button. Racing it against a short timeout keeps this call site safe to
 * ship ahead of that work: once a service worker IS registered elsewhere,
 * this starts finding it immediately with no code change here.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    }),
  ]);
}

/**
 * Best-effort browser push opt-in (US7, FR-020): requests `Notification`
 * permission, subscribes via the service worker's `PushManager`, and
 * registers the resulting subscription with the backend
 * (`POST /v1/account/push-subscription`). Every step is guarded so a
 * failure anywhere degrades to a typed result rather than throwing — email
 * reminders are the guaranteed primary channel and must keep working
 * regardless of what happens here (domain rule, FR-030).
 */
export async function subscribeToPushNotifications(
  accessToken: string,
): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { status: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { status: 'permission-denied' };
    }

    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      return { status: 'unsupported' };
    }

    const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const subscribeOptions: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
      ...(applicationServerKey
        ? { applicationServerKey: urlBase64ToArrayBuffer(applicationServerKey) }
        : {}),
    };
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe(subscribeOptions));

    await registerPushSubscription(accessToken, toSubscriptionRequest(subscription));

    return { status: 'subscribed' };
  } catch (error) {
    return { status: 'error', error };
  }
}
