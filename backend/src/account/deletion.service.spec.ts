import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeletionService, DELETION_GRACE_PERIOD_MS } from './deletion.service';
import type { DeletionRepository, DeletionUserRow } from './deletion.repository';
import type { DeletionQueue } from './deletion.queue';
import type { StorageService } from '../common/uploads/storage.service';

const baseUser: DeletionUserRow = {
  id: 'u1',
  publicId: 'pub-uuid-1',
  deletionStatus: 'active',
  deletionRequestedAt: null,
};

describe('DeletionService (T-130, US8/FR-023)', () => {
  let repo: {
    findUserById: ReturnType<typeof vi.fn>;
    markPendingDeletion: ReturnType<typeof vi.fn>;
    markActive: ReturnType<typeof vi.fn>;
    getPhotoStorageKeys: ReturnType<typeof vi.fn>;
    purgeUserData: ReturnType<typeof vi.fn>;
  };
  let storage: { delete: ReturnType<typeof vi.fn> };
  let queue: { schedulePurge: ReturnType<typeof vi.fn>; unschedulePurge: ReturnType<typeof vi.fn> };
  let service: DeletionService;

  beforeEach(() => {
    repo = {
      findUserById: vi.fn(),
      markPendingDeletion: vi.fn().mockResolvedValue(undefined),
      markActive: vi.fn().mockResolvedValue(undefined),
      getPhotoStorageKeys: vi.fn().mockResolvedValue([]),
      purgeUserData: vi.fn().mockResolvedValue(undefined),
    };
    storage = { delete: vi.fn().mockResolvedValue(undefined) };
    queue = {
      schedulePurge: vi.fn().mockResolvedValue(undefined),
      unschedulePurge: vi.fn().mockResolvedValue(undefined),
    };
    service = new DeletionService(
      repo as unknown as DeletionRepository,
      storage as unknown as StorageService,
      queue as unknown as DeletionQueue,
    );
  });

  describe('requestDeletion', () => {
    it('sets pending_deletion, schedules the delayed purge, and explains the 7-day window', async () => {
      repo.findUserById.mockResolvedValue({ ...baseUser });

      const res = await service.requestDeletion('u1');

      expect(repo.markPendingDeletion).toHaveBeenCalledTimes(1);
      expect(repo.markPendingDeletion.mock.calls[0][0]).toBe('u1');
      expect(queue.schedulePurge).toHaveBeenCalledWith('u1', DELETION_GRACE_PERIOD_MS);
      expect(res.deletionStatus).toBe('pending_deletion');
      expect(res.deletionRequestedAt).not.toBeNull();
      expect(res.purgeScheduledFor).not.toBeNull();
      // Scheduled exactly 7 days out.
      const requestedMs = new Date(res.deletionRequestedAt as string).getTime();
      const scheduledMs = new Date(res.purgeScheduledFor as string).getTime();
      expect(scheduledMs - requestedMs).toBe(DELETION_GRACE_PERIOD_MS);
    });

    it('repeat request while already pending is idempotent (no re-mark, no re-schedule)', async () => {
      const requestedAt = new Date('2026-01-01T00:00:00.000Z');
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        deletionStatus: 'pending_deletion',
        deletionRequestedAt: requestedAt,
      });

      const res = await service.requestDeletion('u1');

      expect(repo.markPendingDeletion).not.toHaveBeenCalled();
      expect(queue.schedulePurge).not.toHaveBeenCalled();
      expect(res.deletionStatus).toBe('pending_deletion');
      expect(res.deletionRequestedAt).toBe(requestedAt.toISOString());
    });

    it('rejects with 409 when the account is already purged', async () => {
      repo.findUserById.mockResolvedValue({ ...baseUser, deletionStatus: 'purged' });

      await expect(service.requestDeletion('u1')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.markPendingDeletion).not.toHaveBeenCalled();
    });

    it('rejects with 404 when the user does not exist', async () => {
      repo.findUserById.mockResolvedValue(null);
      await expect(service.requestDeletion('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancelDeletion', () => {
    it('restores active, clears the timestamp, and unschedules the purge job', async () => {
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        deletionStatus: 'pending_deletion',
        deletionRequestedAt: new Date(),
      });

      const res = await service.cancelDeletion('u1');

      expect(repo.markActive).toHaveBeenCalledWith('u1');
      expect(queue.unschedulePurge).toHaveBeenCalledWith('u1');
      expect(res.deletionStatus).toBe('active');
      expect(res.deletionRequestedAt).toBeNull();
      expect(res.purgeScheduledFor).toBeNull();
    });

    it('rejects with 409 when there is nothing pending to cancel', async () => {
      repo.findUserById.mockResolvedValue({ ...baseUser, deletionStatus: 'active' });

      await expect(service.cancelDeletion('u1')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.markActive).not.toHaveBeenCalled();
    });
  });

  describe('purgeUser', () => {
    it('deletes all rows + storage objects and is driven by the current pending state', async () => {
      const requestedAt = new Date('2026-01-01T00:00:00.000Z');
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        deletionStatus: 'pending_deletion',
        deletionRequestedAt: requestedAt,
      });
      repo.getPhotoStorageKeys.mockResolvedValue(['key/1', 'key/2']);

      await service.purgeUser('u1');

      expect(repo.purgeUserData).toHaveBeenCalledTimes(1);
      const [userIdArg, auditArg] = repo.purgeUserData.mock.calls[0];
      expect(userIdArg).toBe('u1');
      expect(auditArg.requestedAt).toBe(requestedAt);
      expect(auditArg.purgedAt).toBeInstanceOf(Date);
      // PII-free: a deterministic hash, never the raw public_id.
      expect(auditArg.userPublicIdHash).not.toBe('pub-uuid-1');
      expect(auditArg.userPublicIdHash).toMatch(/^[0-9a-f]{64}$/);

      expect(storage.delete).toHaveBeenCalledTimes(2);
      expect(storage.delete).toHaveBeenCalledWith('key/1');
      expect(storage.delete).toHaveBeenCalledWith('key/2');
    });

    it('is idempotent: a no-op when the account is already purged', async () => {
      repo.findUserById.mockResolvedValue({ ...baseUser, deletionStatus: 'purged' });

      await service.purgeUser('u1');

      expect(repo.purgeUserData).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('is idempotent: a no-op when the user cancelled (back to active) before the job ran', async () => {
      repo.findUserById.mockResolvedValue({ ...baseUser, deletionStatus: 'active' });

      await service.purgeUser('u1');

      expect(repo.purgeUserData).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('is a no-op when the user no longer exists', async () => {
      repo.findUserById.mockResolvedValue(null);

      await service.purgeUser('missing');

      expect(repo.purgeUserData).not.toHaveBeenCalled();
    });

    it('a storage delete failure is best-effort and never blocks/throws after the DB purge', async () => {
      repo.findUserById.mockResolvedValue({
        ...baseUser,
        deletionStatus: 'pending_deletion',
        deletionRequestedAt: new Date(),
      });
      repo.getPhotoStorageKeys.mockResolvedValue(['key/1']);
      storage.delete.mockRejectedValueOnce(new Error('object already gone'));

      await expect(service.purgeUser('u1')).resolves.toBeUndefined();
      expect(repo.purgeUserData).toHaveBeenCalledTimes(1);
    });
  });
});
