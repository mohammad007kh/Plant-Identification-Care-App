import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  WebPushSubscriptionRequest,
} from 'shared';
import { UsersRepository } from '../modules/users/users.repository';
import { PushService } from './push.service';

/**
 * Orchestrates `GET/PATCH /v1/account/notifications` and
 * `POST /v1/account/push-subscription` (US7, FR-020/FR-022). Preference
 * toggles live on `users` (T-010); push subscriptions live in Redis
 * (`PushService`) — see that file for why.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly users: UsersRepository,
    private readonly push: PushService,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const row = await this.users.getNotificationPreferences(userId);
    if (!row) throw new NotFoundException({ code: 'user_not_found', message: 'user not found' });
    return row;
  }

  /** FR-022: takes effect immediately — the reminder worker re-checks prefs at send time, not just here. */
  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferences> {
    await this.users.updateNotificationPreferences(userId, patch);
    return this.getPreferences(userId);
  }

  /** Best-effort registration — a browser/environment that blocks push must never surface as an error here. */
  async registerPushSubscription(
    userId: string,
    subscription: WebPushSubscriptionRequest,
  ): Promise<void> {
    await this.push.saveSubscription(userId, subscription);
  }
}
