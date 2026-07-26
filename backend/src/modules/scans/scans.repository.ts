import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { photo, scan, species } from '../../db/schema';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';

export interface CreateIdentifyScanParams {
  /** Pre-generated ULID so the caller can reference the scan before insert (idempotency key). */
  scanId: string;
  userId: string | null;
  guestSessionId: string | null;
  storageKey: string;
  image: NormalizedImage;
}

export interface ScanRow {
  id: string;
  publicId: string;
  type: 'identify' | 'comparison';
  status: 'pending' | 'completed' | 'failed';
  confidence: string | null;
  speciesId: string | null;
  result: unknown;
}

export interface SpeciesRow {
  publicId: string;
  scientificName: string;
  commonNameFa: string | null;
  careGuide: unknown;
}

/**
 * All Drizzle access for the `scan` and `photo` tables (repository pattern —
 * no naked ORM queries in the service/worker per `code_patterns.data_access`).
 */
@Injectable()
export class ScansRepository {
  /**
   * Persists a pending identify `scan` and its `photo` row. `scan.photo_id` is a
   * plain pointer (no FK, to avoid a scan↔photo cycle); `photo.scan_id` is the FK.
   */
  async createIdentifyScan(
    params: CreateIdentifyScanParams,
  ): Promise<{ scanId: string; publicId: string }> {
    const { scanId, userId, guestSessionId, storageKey, image } = params;
    return db.transaction(async (tx) => {
      const [scanRow] = await tx
        .insert(scan)
        .values({
          id: scanId,
          userId,
          guestSessionId,
          type: 'identify',
          status: 'pending',
        })
        .returning({ id: scan.id, publicId: scan.publicId });

      const [photoRow] = await tx
        .insert(photo)
        .values({
          scanId: scanRow.id,
          storageKey,
          contentType: image.contentType,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
        })
        .returning({ id: photo.id });

      await tx.update(scan).set({ photoId: photoRow.id }).where(eq(scan.id, scanRow.id));

      return { scanId: scanRow.id, publicId: scanRow.publicId };
    });
  }

  async findByPublicId(publicId: string): Promise<ScanRow | null> {
    const [row] = await db
      .select({
        id: scan.id,
        publicId: scan.publicId,
        type: scan.type,
        status: scan.status,
        confidence: scan.confidence,
        speciesId: scan.speciesId,
        result: scan.result,
      })
      .from(scan)
      .where(eq(scan.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  async getPhotoStorageKey(scanId: string): Promise<string | null> {
    const [row] = await db
      .select({ storageKey: photo.storageKey })
      .from(photo)
      .where(eq(photo.scanId, scanId))
      .limit(1);
    return row?.storageKey ?? null;
  }

  /** Resolves the AI's species id against the catalog; returns null when not present. */
  async findSpeciesById(speciesId: string): Promise<SpeciesRow | null> {
    const [row] = await db
      .select({
        publicId: species.publicId,
        scientificName: species.scientificName,
        commonNameFa: species.commonNameFa,
        careGuide: species.careGuide,
      })
      .from(species)
      .where(eq(species.id, speciesId))
      .limit(1);
    return row ?? null;
  }

  async markCompleted(
    scanId: string,
    data: { speciesId: string | null; confidence: number; result: unknown },
  ): Promise<void> {
    await db
      .update(scan)
      .set({
        status: 'completed',
        speciesId: data.speciesId,
        confidence: data.confidence.toFixed(3),
        result: data.result,
      })
      .where(eq(scan.id, scanId));
  }

  async markFailed(scanId: string, result: unknown): Promise<void> {
    await db.update(scan).set({ status: 'failed', result }).where(eq(scan.id, scanId));
  }
}
