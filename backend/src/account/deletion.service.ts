import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DeletionStatusResponse } from 'shared';
import { StorageService } from '../common/uploads/storage.service';
import { DeletionQueue } from './deletion.queue';
import { DeletionRepository, type DeletionUserRow } from './deletion.repository';

/** US8/FR-023: 7-day cancellable grace window before permanent purge. */
export const DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Orchestrates the account-deletion state machine (`active` ⇄
 * `pending_deletion` → `purged`) and the complete data purge. Schedules the
 * delayed BullMQ `purge` job on request and removes it on cancel via
 * `DeletionQueue`; the actual consumer (`PurgeWorker`) just calls `purgeUser`
 * — kept here, not in the worker, so the purge logic is directly
 * unit-testable (mirrors the ScansService/IdentifyService split, T-020).
 */
@Injectable()
export class DeletionService {
  constructor(
    private readonly repo: DeletionRepository,
    private readonly storage: StorageService,
    private readonly queue: DeletionQueue,
  ) {}

  async requestDeletion(userId: string): Promise<DeletionStatusResponse> {
    const user = await this.getUserOrThrow(userId);

    if (user.deletionStatus === 'purged') {
      throw new ConflictException({
        code: 'account_already_purged',
        message: 'این حساب قبلاً به‌طور کامل حذف شده است.',
      });
    }

    // Idempotent: a repeat request while already pending just returns the
    // existing schedule instead of pushing the grace window back out.
    if (user.deletionStatus === 'pending_deletion' && user.deletionRequestedAt) {
      return this.toResponse(user);
    }

    const requestedAt = new Date();
    await this.repo.markPendingDeletion(userId, requestedAt);
    await this.queue.schedulePurge(userId, DELETION_GRACE_PERIOD_MS);

    return this.toResponse({
      ...user,
      deletionStatus: 'pending_deletion',
      deletionRequestedAt: requestedAt,
    });
  }

  async cancelDeletion(userId: string): Promise<DeletionStatusResponse> {
    const user = await this.getUserOrThrow(userId);

    if (user.deletionStatus !== 'pending_deletion') {
      throw new ConflictException({
        code: 'deletion_not_pending',
        message: 'درخواست حذفی برای لغو کردن وجود ندارد.',
      });
    }

    await this.repo.markActive(userId);
    await this.queue.unschedulePurge(userId);

    return this.toResponse({ ...user, deletionStatus: 'active', deletionRequestedAt: null });
  }

  async getStatus(userId: string): Promise<DeletionStatusResponse> {
    const user = await this.getUserOrThrow(userId);
    return this.toResponse(user);
  }

  /**
   * The actual purge, run by `PurgeWorker` off the delayed `purge` job (or
   * called directly in tests). Idempotent: a no-op unless the account is
   * currently `pending_deletion` — so re-running on an already-purged account,
   * or one the user cancelled after the job was enqueued, does nothing.
   */
  async purgeUser(userId: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.deletionStatus !== 'pending_deletion') return;

    const storageKeys = await this.repo.getPhotoStorageKeys(userId);

    await this.repo.purgeUserData(userId, {
      userPublicIdHash: this.hashPublicId(user.publicId),
      requestedAt: user.deletionRequestedAt ?? new Date(),
      purgedAt: new Date(),
    });

    await Promise.all(storageKeys.map((key) => this.deleteStorageObjectSafely(key)));
  }

  private async getUserOrThrow(userId: string): Promise<DeletionUserRow> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  private toResponse(user: DeletionUserRow): DeletionStatusResponse {
    const requestedAt = user.deletionRequestedAt;
    return {
      deletionStatus: user.deletionStatus,
      deletionRequestedAt: requestedAt ? requestedAt.toISOString() : null,
      purgeScheduledFor: requestedAt
        ? new Date(requestedAt.getTime() + DELETION_GRACE_PERIOD_MS).toISOString()
        : null,
    };
  }

  private async deleteStorageObjectSafely(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Best-effort: the object may already be gone on a retried/re-run purge;
      // a storage hiccup here must never block the (already-committed) DB purge.
    }
  }

  private hashPublicId(publicId: string): string {
    // One-way, deterministic hash — deletion_audit must stay PII-free (never the
    // raw public_id) per the table's schema contract.
    return createHash('sha256').update(publicId).digest('hex');
  }
}
