import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { UsersModule } from '../modules/users/users.module';
import { MAIL_PORT } from './mail.port';
import { NotificationRepository } from './notification.repository';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { ReminderScheduler } from './reminder.scheduler';
import { ReminderWorker } from './reminder.worker';
import { SmtpMailAdapter } from './smtp-mail.adapter';

/**
 * US7 care-reminders feature module (T-120): preference/push-subscription
 * endpoints, the MailPort-backed email pipeline, best-effort web push, and the
 * BullMQ scheduler/worker pair. Imports AuthModule (JwtAuthGuard/CurrentUserId)
 * and UsersModule (notif prefs live on `users`). NOT imported by app.module
 * here — T-127 registers it (mirrors DeletionModule's wiring convention).
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRepository,
    PushService,
    { provide: MAIL_PORT, useClass: SmtpMailAdapter },
    ReminderScheduler,
    ReminderWorker,
  ],
  exports: [NotificationsService, NotificationRepository, PushService],
})
export class NotificationsModule {}
