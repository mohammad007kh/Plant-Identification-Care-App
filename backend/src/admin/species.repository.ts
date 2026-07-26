import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { CareGuide } from 'shared';
import { db } from '../db/client';
import { species } from '../db/schema';

export interface SpeciesRow {
  publicId: string;
  scientificName: string;
  commonNameFa: string | null;
  // Drizzle's jsonb column type-checks as `unknown` (matches the convention in
  // `PlantsRepository.SpeciesRow`) — narrowed to `CareGuide` by the caller
  // (`CatalogService`), which owns validating what actually came out of `jsonb`.
  careGuide: unknown;
}

const speciesColumns = {
  publicId: species.publicId,
  scientificName: species.scientificName,
  commonNameFa: species.commonNameFa,
  careGuide: species.careGuide,
};

export interface CreateSpeciesParams {
  scientificName: string;
  commonNameFa: string | null;
  careGuide: CareGuide | null;
  /** Internal (ULID) id of the admin creating the row (audit trail). */
  createdBy: string;
}

export interface UpdateSpeciesParams {
  scientificName?: string;
  commonNameFa?: string | null;
  careGuide?: CareGuide | null;
}

/**
 * All Drizzle access for the admin-maintained `species` catalog (repository
 * pattern — no naked ORM outside `*.repository.ts`, per `code_patterns.data_access`).
 * These are the EXACT same rows the identify/plant read paths query — nothing
 * caches `species`, so an admin edit here is visible on the very next read
 * anywhere in the app (FR-024's "no stale cached copy" requirement).
 */
@Injectable()
export class SpeciesRepository {
  async list(): Promise<SpeciesRow[]> {
    return db.select(speciesColumns).from(species).orderBy(asc(species.scientificName));
  }

  async findByPublicId(publicId: string): Promise<SpeciesRow | null> {
    const [row] = await db
      .select(speciesColumns)
      .from(species)
      .where(eq(species.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  async create(params: CreateSpeciesParams): Promise<SpeciesRow> {
    const [row] = await db
      .insert(species)
      .values({
        scientificName: params.scientificName,
        commonNameFa: params.commonNameFa,
        careGuide: params.careGuide,
        createdBy: params.createdBy,
      })
      .returning(speciesColumns);
    return row;
  }

  /**
   * Returns null when no row matches `publicId` (caller maps that to 404).
   * NOTE: the `species` table (T-010) has no `updated_by` column — only
   * `created_by` (set at creation) and `updated_at` (touched here). Recording
   * WHICH admin made an edit would need a schema migration outside this
   * task's scope; flagged for a follow-up task.
   */
  async update(publicId: string, patch: UpdateSpeciesParams): Promise<SpeciesRow | null> {
    const [row] = await db
      .update(species)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(species.publicId, publicId))
      .returning(speciesColumns);
    return row ?? null;
  }
}
