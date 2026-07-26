import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { photo, plant, scan, species } from '../../db/schema';

export interface PlantRow {
  id: string;
  publicId: string;
  userId: string;
  speciesId: string | null;
  nickname: string | null;
  createdAt: Date;
}

export interface PhotoRow {
  id: string;
  publicId: string;
  contentType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface SpeciesRow {
  publicId: string;
  scientificName: string;
  commonNameFa: string | null;
  careGuide: unknown;
}

/** The subset of a `scan` row needed to validate a save-plant-from-scan request. */
export interface OwnedScanRow {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  speciesId: string | null;
}

export interface CreateFromScanParams {
  scanId: string;
  speciesId: string;
  nickname: string | null;
}

export interface AddFollowUpPhotoParams {
  storageKey: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
}

export interface AddFollowUpPhotoResult {
  scanId: string;
  scanPublicId: string;
  photoId: string;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Pick<PlantRow, 'createdAt' | 'id'>): string {
  const payload: Cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

const plantColumns = {
  id: plant.id,
  publicId: plant.publicId,
  userId: plant.userId,
  speciesId: plant.speciesId,
  nickname: plant.nickname,
  createdAt: plant.createdAt,
};

/**
 * All Drizzle access for the `plant` and its `photo`/`scan` history (repository
 * pattern — no naked ORM queries in the service, per `code_patterns.data_access`).
 * Every method requires `userId` and scopes its query by it (registry
 * `database.tenancy_model: single_tenant`) — there is intentionally no
 * "find plant by id alone" method (Station 07 tenancy rule).
 */
@Injectable()
export class PlantsRepository {
  /** Cursor-paginated list of a user's plants, ordered by `created_at DESC`. */
  async list(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ rows: PlantRow[]; nextCursor: string | null }> {
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      throw new BadRequestException({ code: 'invalid_cursor', message: 'cursor is malformed' });
    }

    const conditions = [eq(plant.userId, userId)];
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      const beforeCursor = or(
        lt(plant.createdAt, cursorDate),
        and(eq(plant.createdAt, cursorDate), lt(plant.id, decoded.id)),
      );
      if (beforeCursor) conditions.push(beforeCursor);
    }

    const rows = await db
      .select(plantColumns)
      .from(plant)
      .where(and(...conditions))
      .orderBy(desc(plant.createdAt), desc(plant.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
    return { rows: page, nextCursor };
  }

  /** Resolves `public_id` → row, scoped by `userId`. Returns null if absent OR not owned. */
  async findById(userId: string, publicId: string): Promise<PlantRow | null> {
    const [row] = await db
      .select(plantColumns)
      .from(plant)
      .where(and(eq(plant.publicId, publicId), eq(plant.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /** Ordered photo history for a plant (internal id — caller must already own it). */
  async listPhotosForPlant(plantId: string): Promise<PhotoRow[]> {
    return db
      .select({
        id: photo.id,
        publicId: photo.publicId,
        contentType: photo.contentType,
        bytes: photo.bytes,
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt,
      })
      .from(photo)
      .where(eq(photo.plantId, plantId))
      .orderBy(photo.createdAt);
  }

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

  /** The scan referenced by `POST /v1/plants`, scoped by `userId` (never by id alone). */
  async findOwnedScanByPublicId(
    userId: string,
    scanPublicId: string,
  ): Promise<OwnedScanRow | null> {
    const [row] = await db
      .select({ id: scan.id, status: scan.status, speciesId: scan.speciesId })
      .from(scan)
      .where(and(eq(scan.publicId, scanPublicId), eq(scan.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Creates the `plant` row from a validated scan and re-parents the scan's
   * initial photo onto it (`photo.plant_id`), starting the plant's photo history.
   */
  async createFromScan(userId: string, params: CreateFromScanParams): Promise<PlantRow> {
    const { scanId, speciesId, nickname } = params;
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(plant)
        .values({ userId, speciesId, nickname })
        .returning(plantColumns);

      await tx.update(photo).set({ plantId: row.id }).where(eq(photo.scanId, scanId));

      return row;
    });
  }

  /**
   * Validates plant ownership and, in the same transaction, persists the
   * follow-up photo + a pending `comparison` scan row (FR-010). Returns null
   * when the plant does not exist or is not owned by `userId` (→ 404, never a
   * naked "not found" that could leak existence of another user's plant).
   */
  async addFollowUpPhoto(
    userId: string,
    plantPublicId: string,
    params: AddFollowUpPhotoParams,
  ): Promise<AddFollowUpPhotoResult | null> {
    return db.transaction(async (tx) => {
      const [ownedPlant] = await tx
        .select({ id: plant.id })
        .from(plant)
        .where(and(eq(plant.publicId, plantPublicId), eq(plant.userId, userId)))
        .limit(1);
      if (!ownedPlant) return null;

      const [scanRow] = await tx
        .insert(scan)
        .values({ userId, plantId: ownedPlant.id, type: 'comparison', status: 'pending' })
        .returning({ id: scan.id, publicId: scan.publicId });

      const [photoRow] = await tx
        .insert(photo)
        .values({
          plantId: ownedPlant.id,
          scanId: scanRow.id,
          storageKey: params.storageKey,
          contentType: params.contentType,
          bytes: params.bytes,
          width: params.width,
          height: params.height,
        })
        .returning({ id: photo.id });

      await tx.update(scan).set({ photoId: photoRow.id }).where(eq(scan.id, scanRow.id));

      return { scanId: scanRow.id, scanPublicId: scanRow.publicId, photoId: photoRow.id };
    });
  }
}
