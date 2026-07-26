import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type IORedis from 'ioredis';
import webpush from 'web-push';
import { createRedisConnection } from '../jobs/queues';

/** A W3C `PushSubscriptionJSON`-shaped browser subscription. */
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export interface PushPayload {
  title: string;
  body: string;
}

const REDIS_KEY_PREFIX = 'push-sub:';
// Re-registered by the browser on every app visit (T-121); a stale
// subscription just expires here rather than accumulating forever.
const SUBSCRIPTION_TTL_SECONDS = 60 * 60 * 24 * 180;

/**
 * Best-effort web-push sender (US7, FR-020). Push is explicitly the
 * SECONDARY channel — VAPID/FCM delivery is unreliable from Iran and MUST
 * NOT be a guaranteed path (email via `MailPort` is guaranteed). Subscriptions
 * are stored in Redis, not Postgres, keyed by the internal user id — mirrors
 * `RefreshTokenRepository`'s Redis-KV pattern (auth module). A subscription is
 * ephemeral browser state, not a durable business record, so this avoids a
 * schema/migration footprint for a channel that is allowed to silently no-op.
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private redis?: IORedis;
  private vapidConfigured = false;

  private conn(): IORedis {
    if (!this.redis) this.redis = createRedisConnection();
    return this.redis;
  }

  private key(userId: string): string {
    return `${REDIS_KEY_PREFIX}${userId}`;
  }

  /** Lazily configures web-push's VAPID identity. Returns false if unset (push disabled). */
  private ensureVapid(): boolean {
    if (this.vapidConfigured) return true;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return false;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@plantcare.local';
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.vapidConfigured = true;
    return true;
  }

  /** Registers/refreshes the caller's push subscription (`POST /v1/account/push-subscription`). */
  async saveSubscription(userId: string, subscription: WebPushSubscription): Promise<void> {
    await this.conn().set(
      this.key(userId),
      JSON.stringify(subscription),
      'EX',
      SUBSCRIPTION_TTL_SECONDS,
    );
  }

  /**
   * Attempts to deliver `payload` to the user's registered subscription.
   * Returns `false` (NOT an error) when there is simply nothing to send to —
   * no subscription registered, or VAPID keys unset in this environment. A
   * genuine send failure (expired subscription, network error, etc.)
   * propagates so the caller can record it as `failed` rather than silently
   * losing it.
   */
  async sendBestEffort(userId: string, payload: PushPayload): Promise<boolean> {
    if (!this.ensureVapid()) return false;

    const raw = await this.conn().get(this.key(userId));
    if (!raw) return false;

    let subscription: WebPushSubscription;
    try {
      subscription = JSON.parse(raw) as WebPushSubscription;
    } catch {
      this.logger.warn(`corrupt push subscription for user ${userId}; dropping it`);
      await this.conn().del(this.key(userId));
      return false;
    }

    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
