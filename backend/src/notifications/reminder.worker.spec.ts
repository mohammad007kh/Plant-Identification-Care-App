import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotificationConfig } from 'shared';
import { ReminderWorker, type ReminderJobData } from './reminder.worker';
import type {
  ExistingNotificationRow,
  NotificationRepository,
  ReminderPlantRow,
  ReminderUserRow,
} from './notification.repository';
import type { MailPort } from './mail.port';
import type { PushService } from './push.service';
import type { AppConfigService } from '../common/config/app-config.service';

const activeUser: ReminderUserRow = {
  id: 'u1',
  email: 'owner@test.local',
  notifEmailEnabled: true,
  notifPushEnabled: true,
};

const plantRow: ReminderPlantRow = {
  id: 'p1',
  nickname: 'شمعدانی من',
  speciesScientificName: 'Pelargonium',
  speciesCommonNameFa: 'شمعدانی',
};

const notificationConfig: NotificationConfig = {
  templates: {
    watering: {
      subject: 'وقت آبیاری {{plantName}}',
      bodyFa: 'گیاه {{plantName}} شما نیاز به آب دارد.',
    },
    custom: { subject: 'یادآوری', bodyFa: 'یادآوری برای {{plantName}}' },
  },
  sendHourLocalTehran: 9,
};

const jobData: ReminderJobData = {
  userId: 'u1',
  plantId: 'p1',
  type: 'watering',
  scheduledFor: '2026-07-26T05:30:00.000Z',
};

describe('ReminderWorker.processReminder (T-120, US7/FR-020/FR-021/FR-022)', () => {
  let repo: {
    findUserForReminder: ReturnType<typeof vi.fn>;
    findPlantForReminder: ReturnType<typeof vi.fn>;
    findExisting: ReturnType<typeof vi.fn>;
    upsertNotification: ReturnType<typeof vi.fn>;
  };
  let mail: { send: ReturnType<typeof vi.fn> };
  let push: { sendBestEffort: ReturnType<typeof vi.fn> };
  let config: { getNotificationConfig: ReturnType<typeof vi.fn> };
  let worker: ReminderWorker;

  beforeEach(() => {
    repo = {
      findUserForReminder: vi.fn().mockResolvedValue(activeUser),
      findPlantForReminder: vi.fn().mockResolvedValue(plantRow),
      findExisting: vi.fn().mockResolvedValue(null),
      upsertNotification: vi.fn().mockResolvedValue(undefined),
    };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    push = { sendBestEffort: vi.fn().mockResolvedValue(true) };
    config = { getNotificationConfig: vi.fn().mockResolvedValue(notificationConfig) };

    worker = new ReminderWorker(
      repo as unknown as NotificationRepository,
      mail as unknown as MailPort,
      push as unknown as PushService,
      config as unknown as AppConfigService,
    );
  });

  it('sends email + push and records both as sent when both channels are enabled', async () => {
    await worker.processReminder(jobData);

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: activeUser.email,
        subject: expect.stringContaining('شمعدانی من'),
      }),
    );
    expect(push.sendBestEffort).toHaveBeenCalledTimes(1);
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'sent' }),
    );
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'push', status: 'sent' }),
    );
  });

  it('a disabled user gets no send on either channel (checked at send time, not schedule time)', async () => {
    repo.findUserForReminder.mockResolvedValue({
      ...activeUser,
      notifEmailEnabled: false,
      notifPushEnabled: false,
    });

    await worker.processReminder(jobData);

    expect(mail.send).not.toHaveBeenCalled();
    expect(push.sendBestEffort).not.toHaveBeenCalled();
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'skipped' }),
    );
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'push', status: 'skipped' }),
    );
  });

  it('email is sent via MailPort even when the push attempt throws', async () => {
    push.sendBestEffort.mockRejectedValue(new Error('push service unreachable'));

    await expect(worker.processReminder(jobData)).resolves.toBeUndefined();

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'sent' }),
    );
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'push', status: 'failed' }),
    );
  });

  it('a failing email send is recorded as failed and never throws out of processReminder', async () => {
    mail.send.mockRejectedValue(new Error('smtp unreachable'));

    await expect(worker.processReminder(jobData)).resolves.toBeUndefined();

    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', status: 'failed' }),
    );
    // Push must still be attempted independently of the email outcome.
    expect(push.sendBestEffort).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a re-delivered job for the same due window does not re-send an already-sent channel', async () => {
    const sentRow: ExistingNotificationRow = { id: 'n1', status: 'sent' };
    repo.findExisting
      .mockResolvedValueOnce(null) // first delivery: email not yet sent
      .mockResolvedValueOnce(null) // first delivery: push not yet sent
      .mockResolvedValueOnce(sentRow) // re-delivery: email already sent
      .mockResolvedValueOnce(sentRow); // re-delivery: push already sent

    await worker.processReminder(jobData);
    await worker.processReminder(jobData); // simulates a BullMQ at-least-once redelivery

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(push.sendBestEffort).toHaveBeenCalledTimes(1);
  });

  it('stores scheduledFor as the exact UTC instant from the job payload', async () => {
    await worker.processReminder(jobData);

    const expected = new Date(jobData.scheduledFor);
    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor: expected }),
    );
  });

  it('is a no-op when the user no longer exists (e.g. purged after scheduling)', async () => {
    repo.findUserForReminder.mockResolvedValue(null);

    await worker.processReminder(jobData);

    expect(mail.send).not.toHaveBeenCalled();
    expect(push.sendBestEffort).not.toHaveBeenCalled();
    expect(repo.upsertNotification).not.toHaveBeenCalled();
  });

  it('is a no-op when the plant no longer exists (e.g. deleted after scheduling)', async () => {
    repo.findPlantForReminder.mockResolvedValue(null);

    await worker.processReminder(jobData);

    expect(mail.send).not.toHaveBeenCalled();
    expect(push.sendBestEffort).not.toHaveBeenCalled();
    expect(repo.upsertNotification).not.toHaveBeenCalled();
  });

  it('records push as skipped (not failed) when there is simply no active subscription', async () => {
    push.sendBestEffort.mockResolvedValue(false);

    await worker.processReminder(jobData);

    expect(repo.upsertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'push', status: 'skipped' }),
    );
  });
});
