import { Injectable } from '@nestjs/common';
import { eq, inArray, or } from 'drizzle-orm';
import type { DeletionStatus } from 'shared';
import { db } from '../db/client';
import {
  chatConversation,
  chatMessage,
  comparisonResult,
  creditTransaction,
  deletionAudit,
  misidentificationReport,
  notification,
  paymentEvent,
  photo,
  plant,
  scan,
  usageRecord,
  users,
} from '../db/schema';

export interface DeletionUserRow {
  id: string;
  publicId: string;
  deletionStatus: DeletionStatus;
  deletionRequestedAt: Date | null;
}

export interface PurgeAuditInput {
  userPublicIdHash: string;
  requestedAt: Date;
  purgedAt: Date;
}

/**
 * All Drizzle access for account-deletion (T-130): reading/transitioning
 * `users.deletion_status`, collecting the storage keys owned by a user, and the
 * full purge cascade (repository pattern — no naked ORM queries in the
 * service/worker per `code_patterns.data_access`).
 */
@Injectable()
export class DeletionRepository {
  async findUserById(userId: string): Promise<DeletionUserRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        publicId: users.publicId,
        deletionStatus: users.deletionStatus,
        deletionRequestedAt: users.deletionRequestedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async markPendingDeletion(userId: string, requestedAt: Date): Promise<void> {
    await db
      .update(users)
      .set({ deletionStatus: 'pending_deletion', deletionRequestedAt: requestedAt })
      .where(eq(users.id, userId));
  }

  async markActive(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ deletionStatus: 'active', deletionRequestedAt: null })
      .where(eq(users.id, userId));
  }

  /**
   * Every S3 `storage_key` owned by the user (via their plants and/or scans).
   * MUST be read before `purgeUserData` deletes the `photo` rows — this is the
   * caller's only chance to know which objects to delete from object storage.
   */
  async getPhotoStorageKeys(userId: string): Promise<string[]> {
    const [plantIds, scanIds] = await Promise.all([
      this.plantIdsFor(userId),
      this.scanIdsFor(userId),
    ]);
    if (plantIds.length === 0 && scanIds.length === 0) return [];

    const conditions = [];
    if (plantIds.length > 0) conditions.push(inArray(photo.plantId, plantIds));
    if (scanIds.length > 0) conditions.push(inArray(photo.scanId, scanIds));

    const rows = await db
      .select({ storageKey: photo.storageKey })
      .from(photo)
      .where(or(...conditions));
    return rows.map((r) => r.storageKey);
  }

  /**
   * Deletes every DB row associated with the user in FK-safe dependency order
   * (children before parents), writes the PII-free `deletion_audit` row, and
   * sets `deletion_status = purged` — all inside one transaction, so a mid-purge
   * crash never leaves the account half-deleted (a retry sees the pre-purge
   * state and starts over cleanly).
   *
   * Deliberately NOT touched here (out of scope per Station 14 domain rules):
   * `analytics_event` (cross-cutting, not user-owned PII) and
   * `misidentification_report` rows the user authored about *other* users'
   * scans (only reports pointing at THIS user's own scans are removed, which
   * is required to satisfy the `scan_id` FK before the scan itself is deleted).
   */
  async purgeUserData(userId: string, audit: PurgeAuditInput): Promise<void> {
    await db.transaction(async (tx) => {
      const plantRows = await tx
        .select({ id: plant.id })
        .from(plant)
        .where(eq(plant.userId, userId));
      const plantIds = plantRows.map((r) => r.id);

      const scanRows = await tx.select({ id: scan.id }).from(scan).where(eq(scan.userId, userId));
      const scanIds = scanRows.map((r) => r.id);

      if (scanIds.length > 0) {
        await tx
          .delete(misidentificationReport)
          .where(inArray(misidentificationReport.scanId, scanIds));
      }

      if (plantIds.length > 0) {
        const conversationRows = await tx
          .select({ id: chatConversation.id })
          .from(chatConversation)
          .where(inArray(chatConversation.plantId, plantIds));
        const conversationIds = conversationRows.map((r) => r.id);
        if (conversationIds.length > 0) {
          await tx.delete(chatMessage).where(inArray(chatMessage.conversationId, conversationIds));
        }
        await tx.delete(chatConversation).where(inArray(chatConversation.plantId, plantIds));
      }

      if (scanIds.length > 0) {
        await tx.delete(comparisonResult).where(inArray(comparisonResult.scanId, scanIds));
      }

      if (plantIds.length > 0 || scanIds.length > 0) {
        const photoConditions = [];
        if (plantIds.length > 0) photoConditions.push(inArray(photo.plantId, plantIds));
        if (scanIds.length > 0) photoConditions.push(inArray(photo.scanId, scanIds));
        await tx.delete(photo).where(or(...photoConditions));
      }

      await tx.delete(notification).where(eq(notification.userId, userId));

      if (scanIds.length > 0) {
        await tx.delete(scan).where(eq(scan.userId, userId));
      }
      if (plantIds.length > 0) {
        await tx.delete(plant).where(eq(plant.userId, userId));
      }

      await tx.delete(usageRecord).where(eq(usageRecord.userId, userId));
      await tx.delete(creditTransaction).where(eq(creditTransaction.userId, userId));
      await tx.delete(paymentEvent).where(eq(paymentEvent.userId, userId));

      await tx.insert(deletionAudit).values({
        userPublicIdHash: audit.userPublicIdHash,
        requestedAt: audit.requestedAt,
        purgedAt: audit.purgedAt,
        outcome: 'completed',
      });

      await tx.update(users).set({ deletionStatus: 'purged' }).where(eq(users.id, userId));
    });
  }

  private async plantIdsFor(userId: string): Promise<string[]> {
    const rows = await db.select({ id: plant.id }).from(plant).where(eq(plant.userId, userId));
    return rows.map((r) => r.id);
  }

  private async scanIdsFor(userId: string): Promise<string[]> {
    const rows = await db.select({ id: scan.id }).from(scan).where(eq(scan.userId, userId));
    return rows.map((r) => r.id);
  }
}
