import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminSpecies, CareGuide, CreateSpeciesRequest, UpdateSpeciesRequest } from 'shared';
import { SpeciesRepository, type SpeciesRow } from './species.repository';

function toAdminSpecies(row: SpeciesRow): AdminSpecies {
  return {
    publicId: row.publicId,
    scientificName: row.scientificName,
    commonNameFa: row.commonNameFa,
    // `careGuide` is admin-authored jsonb (written only via `createSpeciesRequestSchema`/
    // `updateSpeciesRequestSchema`, both Zod-validated at the controller) — safe to
    // narrow from Drizzle's `unknown` back to `CareGuide` here.
    careGuide: (row.careGuide as CareGuide | null) ?? null,
  };
}

/**
 * Admin species/care-guide CRUD (US9, FR-024). Pure orchestration over
 * `SpeciesRepository` — no direct Drizzle access here (repository pattern).
 * Edits take effect immediately for the identify/plant read paths: nothing in
 * this app caches `species` rows, so the very next read anywhere sees the
 * new scientific name / common name / care guide.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly speciesRepo: SpeciesRepository) {}

  async list(): Promise<AdminSpecies[]> {
    const rows = await this.speciesRepo.list();
    return rows.map(toAdminSpecies);
  }

  async create(adminUserId: string, req: CreateSpeciesRequest): Promise<AdminSpecies> {
    const row = await this.speciesRepo.create({
      scientificName: req.scientificName,
      commonNameFa: req.commonNameFa ?? null,
      careGuide: req.careGuide ?? null,
      createdBy: adminUserId,
    });
    return toAdminSpecies(row);
  }

  async update(publicId: string, req: UpdateSpeciesRequest): Promise<AdminSpecies> {
    const row = await this.speciesRepo.update(publicId, req);
    if (!row) throw new NotFoundException('species.notFound');
    return toAdminSpecies(row);
  }
}
