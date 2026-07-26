import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlantsService } from './plants.service';
import type { PlantsRepository } from './plants.repository';
import type { StorageService } from '../../common/uploads/storage.service';
import type { ComparisonQueue } from './comparison.queue';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';

const image: NormalizedImage = {
  normalizedBuffer: Buffer.from('img'),
  contentType: 'image/png',
  width: 8,
  height: 8,
  bytes: 3,
};

const plantRow = {
  id: 'plant-internal-1',
  publicId: 'plant-pub-uuid',
  userId: 'u1',
  speciesId: null,
  nickname: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('PlantsService.saveFromScan (T-060, FR-009)', () => {
  let repo: {
    findOwnedScanByPublicId: ReturnType<typeof vi.fn>;
    createFromScan: ReturnType<typeof vi.fn>;
    findSpeciesById: ReturnType<typeof vi.fn>;
    listPhotosForPlant: ReturnType<typeof vi.fn>;
  };
  let storage: { put: ReturnType<typeof vi.fn> };
  let queue: { enqueueComparison: ReturnType<typeof vi.fn> };
  let service: PlantsService;

  beforeEach(() => {
    repo = {
      findOwnedScanByPublicId: vi.fn(),
      createFromScan: vi.fn().mockResolvedValue(plantRow),
      findSpeciesById: vi.fn().mockResolvedValue(null),
      listPhotosForPlant: vi.fn().mockResolvedValue([]),
    };
    storage = { put: vi.fn().mockResolvedValue('key/1') };
    queue = { enqueueComparison: vi.fn().mockResolvedValue(undefined) };
    service = new PlantsService(
      repo as unknown as PlantsRepository,
      storage as unknown as StorageService,
      queue as unknown as ComparisonQueue,
    );
  });

  it('creates the plant when the scan is completed, successful, and owned by the caller', async () => {
    repo.findOwnedScanByPublicId.mockResolvedValue({
      id: 'scan-internal-1',
      status: 'completed',
      speciesId: 'species-1',
    });

    const result = await service.saveFromScan('u1', { scanPublicId: 'scan-pub-uuid' });

    expect(repo.createFromScan).toHaveBeenCalledWith('u1', {
      scanId: 'scan-internal-1',
      speciesId: 'species-1',
      nickname: null,
    });
    expect(result).toMatchObject({ id: 'plant-pub-uuid', nickname: null, photos: [] });
  });

  it('rejects (400) when the scan does not belong to the caller (not found for this user)', async () => {
    repo.findOwnedScanByPublicId.mockResolvedValue(null);

    await expect(
      service.saveFromScan('u1', { scanPublicId: 'someone-elses-scan' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createFromScan).not.toHaveBeenCalled();
  });

  it('rejects (400) when the scan is still pending', async () => {
    repo.findOwnedScanByPublicId.mockResolvedValue({
      id: 'scan-internal-1',
      status: 'pending',
      speciesId: null,
    });

    await expect(
      service.saveFromScan('u1', { scanPublicId: 'scan-pub-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createFromScan).not.toHaveBeenCalled();
  });

  it('rejects (400) when the scan completed without a species (low-confidence, not "successful")', async () => {
    repo.findOwnedScanByPublicId.mockResolvedValue({
      id: 'scan-internal-1',
      status: 'completed',
      speciesId: null,
    });

    await expect(
      service.saveFromScan('u1', { scanPublicId: 'scan-pub-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createFromScan).not.toHaveBeenCalled();
  });
});

describe('PlantsService.addFollowUpPhoto (T-060, FR-010)', () => {
  let repo: {
    addFollowUpPhoto: ReturnType<typeof vi.fn>;
  };
  let storage: { put: ReturnType<typeof vi.fn> };
  let queue: { enqueueComparison: ReturnType<typeof vi.fn> };
  let service: PlantsService;

  beforeEach(() => {
    repo = {
      addFollowUpPhoto: vi.fn(),
    };
    storage = { put: vi.fn().mockResolvedValue('key/2') };
    queue = { enqueueComparison: vi.fn().mockResolvedValue(undefined) };
    service = new PlantsService(
      repo as unknown as PlantsRepository,
      storage as unknown as StorageService,
      queue as unknown as ComparisonQueue,
    );
  });

  it('persists the photo + pending comparison scan and enqueues the job (202 envelope)', async () => {
    repo.addFollowUpPhoto.mockResolvedValue({
      scanId: 'scan-internal-2',
      scanPublicId: 'scan-pub-2',
      photoId: 'photo-internal-1',
    });

    const job = await service.addFollowUpPhoto('u1', 'plant-pub-uuid', image);

    expect(storage.put).toHaveBeenCalledWith(image.normalizedBuffer, image.contentType);
    expect(repo.addFollowUpPhoto).toHaveBeenCalledWith('u1', 'plant-pub-uuid', {
      storageKey: 'key/2',
      contentType: image.contentType,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
    });
    expect(queue.enqueueComparison).toHaveBeenCalledWith({ scanId: 'scan-internal-2' });
    expect(job).toMatchObject({
      id: 'scan-pub-2',
      type: 'comparison',
      status: 'pending',
      species: null,
    });
  });

  it('throws 404 when the plant does not exist or is not owned by the caller (tenant isolation)', async () => {
    repo.addFollowUpPhoto.mockResolvedValue(null);

    await expect(
      service.addFollowUpPhoto('u1', 'someone-elses-plant', image),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queue.enqueueComparison).not.toHaveBeenCalled();
  });

  it('does not fail the request when the enqueue itself throws (best-effort; DB writes already committed)', async () => {
    repo.addFollowUpPhoto.mockResolvedValue({
      scanId: 'scan-internal-3',
      scanPublicId: 'scan-pub-3',
      photoId: 'photo-internal-2',
    });
    queue.enqueueComparison.mockRejectedValueOnce(new Error('redis down'));

    const job = await service.addFollowUpPhoto('u1', 'plant-pub-uuid', image);
    expect(job.status).toBe('pending');
  });
});
