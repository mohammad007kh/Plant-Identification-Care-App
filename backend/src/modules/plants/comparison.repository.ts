import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { HealthVerdict } from 'shared';
import { db } from '../../db/client';
import { comparisonResult, photo, plant, scan } from '../../db/schema';

/** Internal-id scan shape needed to process (and validate) a comparison job. */
export interface ScanForProcessing {
  id: string;
  userId: string | null;
  plantId: string | null;
}

export interface PlantPhotoRow {
  id: string;
  publicId: string;
  storageKey: string;
  createdAt: Date;
}

export interface PersistResultParams {
  scanId: string;
  plantId: string;
  verdict: HealthVerdict;
  referencedPhotoIds: string[];
}

export interface ComparisonResultRow {
  verdict: HealthVerdict;
  referencedPhotoIds: string[] | null;
}

/**
 * All Drizzle access for the comparison worker/service: reads `scan`/`plant`/
 * `photo` directly and owns the `comparison_result` writes (repository pattern
 * — no naked ORM queries in the service/worker, per `code_patterns.data_access`).
 *
 * Deliberately does NOT import ScansRepository/PlantsRepository — this module
 * must not depend on the `scans`/`plants` business-logic modules (T-100 scope
 * excludes touching them), only on the shared `db/schema` tables, mirroring
 * how PlantsRepository itself reads `scan`/`photo` directly instead of going
 * through ScansModule.
 */
@Injectable()
export class ComparisonRepository {
  /** Internal-id scan lookup for the worker (trusted `scanId` from the job payload). */
  async findScanForProcessing(scanId: string): Promise<ScanForProcessing | null> {
    const [row] = await db
      .select({ id: scan.id, userId: scan.userId, plantId: scan.plantId })
      .from(scan)
      .where(eq(scan.id, scanId))
      .limit(1);
    return row ?? null;
  }

  /**
   * The `limit` most recent photos for a plant, newest first, scoped by the
   * owning user — defense-in-depth tenancy check (registry
   * `database.tenancy_model: single_tenant`) even though `plantId` here comes
   * from a scan row that was itself created under an ownership-checked request.
   */
  async getRecentPhotos(plantId: string, userId: string, limit: number): Promise<PlantPhotoRow[]> {
    return db
      .select({
        id: photo.id,
        publicId: photo.publicId,
        storageKey: photo.storageKey,
        createdAt: photo.createdAt,
      })
      .from(photo)
      .innerJoin(plant, eq(plant.id, photo.plantId))
      .where(and(eq(photo.plantId, plantId), eq(plant.userId, userId)))
      .orderBy(desc(photo.createdAt))
      .limit(limit);
  }

  /** <2-photo path (FR-011): scan resolves to an explicit "follow-up needed" state, no charge. */
  async markFollowUpNeeded(scanId: string, message: string): Promise<void> {
    await db
      .update(scan)
      .set({ status: 'completed', result: { status: 'follow_up_needed', message } })
      .where(eq(scan.id, scanId));
  }

  async markFailed(scanId: string, message: string): Promise<void> {
    await db.update(scan).set({ status: 'failed', result: { message } }).where(eq(scan.id, scanId));
  }

  /** Persists the verdict and resolves the scan atomically (both-or-neither). */
  async persistResult(params: PersistResultParams): Promise<void> {
    const { scanId, plantId, verdict, referencedPhotoIds } = params;
    await db.transaction(async (tx) => {
      await tx.insert(comparisonResult).values({ scanId, plantId, verdict, referencedPhotoIds });
      await tx
        .update(scan)
        .set({ status: 'completed', result: { verdict, referencedPhotoIds } })
        .where(eq(scan.id, scanId));
    });
  }

  /**
   * Tenancy-scoped result read for the (future) result-fetch route: joins
   * through `scan.public_id` AND `scan.user_id` in the same query, so another
   * user's scan id resolves to `null` (→ 404 at the caller) rather than a
   * two-step "exists, then check owner" that could leak existence.
   */
  async findResultForUser(
    userId: string,
    scanPublicId: string,
  ): Promise<ComparisonResultRow | null> {
    const [row] = await db
      .select({
        verdict: comparisonResult.verdict,
        referencedPhotoIds: comparisonResult.referencedPhotoIds,
      })
      .from(scan)
      .innerJoin(comparisonResult, eq(comparisonResult.scanId, scan.id))
      .where(and(eq(scan.publicId, scanPublicId), eq(scan.userId, userId)))
      .limit(1);
    return row ?? null;
  }
}
