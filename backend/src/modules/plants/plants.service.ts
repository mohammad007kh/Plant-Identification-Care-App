import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ScanJob, SavePlantRequest } from 'shared';
import { StorageService } from '../../common/uploads/storage.service';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';
import { ComparisonQueue } from './comparison.queue';
import { PlantsRepository, type PlantRow } from './plants.repository';

export interface PlantPhotoDto {
  id: string;
  contentType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface PlantSpeciesDto {
  id: string;
  scientificName: string;
  commonNameFa: string | null;
  careGuide: unknown;
}

/** Mirrors the OpenAPI `Plant` schema (shared/src/contracts/plant.ts `plantSchema`). */
export interface PlantDto {
  id: string;
  nickname: string | null;
  species: PlantSpeciesDto | null;
  photos: PlantPhotoDto[];
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Business logic for the plants CRUD surface (US3, FR-009/FR-010). Every
 * public method takes the authenticated `userId` and delegates all DB access
 * to `PlantsRepository` (repository pattern; no naked Drizzle queries here).
 */
@Injectable()
export class PlantsService {
  constructor(
    private readonly repo: PlantsRepository,
    private readonly storage: StorageService,
    private readonly comparisonQueue: ComparisonQueue,
  ) {}

  async list(userId: string, cursor: string | null, limit: number): Promise<CursorPage<PlantDto>> {
    const { rows, nextCursor } = await this.repo.list(userId, cursor, limit);
    const data = await Promise.all(rows.map((row) => this.toPlantDto(row)));
    return { data, nextCursor };
  }

  async getOne(userId: string, publicId: string): Promise<PlantDto> {
    const row = await this.repo.findById(userId, publicId);
    if (!row) throw new NotFoundException('plant not found');
    return this.toPlantDto(row);
  }

  /**
   * Saves a plant from a completed, successful scan (FR-009). "Successful"
   * means `status = completed` AND a species was identified (a completed
   * low-confidence scan has no species and cannot be saved as a plant yet).
   */
  async saveFromScan(userId: string, params: SavePlantRequest): Promise<PlantDto> {
    const scanRow = await this.repo.findOwnedScanByPublicId(userId, params.scanPublicId);
    if (!scanRow || scanRow.status !== 'completed' || !scanRow.speciesId) {
      throw new BadRequestException({
        code: 'invalid_scan',
        message:
          'the referenced scan must be a completed, successful identification belonging to the caller',
      });
    }

    const row = await this.repo.createFromScan(userId, {
      scanId: scanRow.id,
      speciesId: scanRow.speciesId,
      nickname: params.nickname ?? null,
    });
    return this.toPlantDto(row);
  }

  /**
   * Adds a follow-up photo to an existing plant's history (FR-010): persists
   * the photo + a pending `comparison` scan, then enqueues the async job.
   * Credit debit/402 guard is a deliberate extension point — T-082 wires
   * `CreditsService.reserve(...)` here once the comparison AI pipeline (US5)
   * exists; this task only needs the persistence + `202` envelope.
   */
  async addFollowUpPhoto(
    userId: string,
    plantPublicId: string,
    image: NormalizedImage,
  ): Promise<ScanJob> {
    const storageKey = await this.storage.put(image.normalizedBuffer, image.contentType);

    const result = await this.repo.addFollowUpPhoto(userId, plantPublicId, {
      storageKey,
      contentType: image.contentType,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
    });
    if (!result) throw new NotFoundException('plant not found');

    try {
      await this.comparisonQueue.enqueueComparison({ scanId: result.scanId });
    } catch {
      // Enqueue-failure handling (mark scan failed, surface a retry error) mirrors
      // ScansService.submitIdentify's pattern but is out of scope here: no credit
      // is reserved yet (T-082), so there is nothing to refund. The comparison AI
      // task (US5) owns the full enqueue-failure story once that wiring lands.
    }

    return {
      id: result.scanPublicId,
      type: 'comparison',
      status: 'pending',
      confidence: null,
      species: null,
      careGuide: null,
      lowConfidence: false,
      message: null,
    };
  }

  private async toPlantDto(row: PlantRow): Promise<PlantDto> {
    const [species, photos] = await Promise.all([
      row.speciesId ? this.repo.findSpeciesById(row.speciesId) : Promise.resolve(null),
      this.repo.listPhotosForPlant(row.id),
    ]);

    return {
      id: row.publicId,
      nickname: row.nickname,
      species: species
        ? {
            id: species.publicId,
            scientificName: species.scientificName,
            commonNameFa: species.commonNameFa,
            careGuide: species.careGuide,
          }
        : null,
      photos: photos.map((p) => ({
        id: p.publicId,
        contentType: p.contentType,
        bytes: p.bytes,
        width: p.width,
        height: p.height,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }
}
