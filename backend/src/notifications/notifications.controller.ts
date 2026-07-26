import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  updateNotificationPreferencesRequestSchema,
  webPushSubscriptionSchema,
  type NotificationPreferences,
} from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

/**
 * `GET/PATCH /v1/account/notifications` + `POST /v1/account/push-subscription`
 * (US7, FR-020/FR-022). Every route JWT-guarded; `userId` always comes from
 * the verified principal (`@CurrentUserId()`), never a body/path param. Not
 * registered in app.module here — T-127 wires this module.
 */
@Controller('account')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Current channel toggles (consumed by the settings UI, T-121). */
  @Get('notifications')
  getPreferences(@CurrentUserId() userId: string): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(userId);
  }

  @Patch('notifications')
  updatePreferences(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ): Promise<NotificationPreferences> {
    const parsed = updateNotificationPreferencesRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    return this.notifications.updatePreferences(userId, parsed.data);
  }

  /** Registers a web-push subscription (best-effort/secondary channel). */
  @Post('push-subscription')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerPushSubscription(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const parsed = webPushSubscriptionSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);
    await this.notifications.registerPushSubscription(userId, parsed.data);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
