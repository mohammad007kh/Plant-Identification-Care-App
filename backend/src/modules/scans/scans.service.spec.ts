import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ScansService } from './scans.service';
import { IdentifyService } from './identify.service';
import type { ScansRepository } from './scans.repository';
import type { IdentifyQueue } from './identify.queue';
import type { CreditsService } from '../../credits/credits.service';
import type { StorageService } from '../../common/uploads/storage.service';
import type { AppConfigService } from '../../common/config/app-config.service';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';

const image: NormalizedImage = {
  normalizedBuffer: Buffer.from('img'),
  contentType: 'image/png',
  width: 8,
  height: 8,
  bytes: 3,
};

describe('ScansService.submitIdentify (T-020, FR-015)', () => {
  let repo: { createIdentifyScan: ReturnType<typeof vi.fn>; markFailed: ReturnType<typeof vi.fn> };
  let storage: { put: ReturnType<typeof vi.fn> };
  let credits: { reserve: ReturnType<typeof vi.fn>; refundUsage: ReturnType<typeof vi.fn> };
  let config: { getCreditCosts: ReturnType<typeof vi.fn> };
  let queue: { enqueueIdentify: ReturnType<typeof vi.fn> };
  let service: ScansService;

  beforeEach(() => {
    repo = {
      createIdentifyScan: vi.fn().mockResolvedValue({ scanId: 'S', publicId: 'pub-uuid' }),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    storage = { put: vi.fn().mockResolvedValue('key/1') };
    credits = {
      reserve: vi.fn().mockResolvedValue({ usageRecordId: 'ur1' }),
      refundUsage: vi.fn().mockResolvedValue(undefined),
    };
    config = { getCreditCosts: vi.fn().mockResolvedValue({ identify: 2, chat: 1, comparison: 3 }) };
    queue = { enqueueIdentify: vi.fn().mockResolvedValue(undefined) };
    service = new ScansService(
      repo as unknown as ScansRepository,
      storage as unknown as StorageService,
      credits as unknown as CreditsService,
      config as unknown as AppConfigService,
      queue as unknown as IdentifyQueue,
    );
  });

  it('authenticated: reserves the identify cost with the client Idempotency-Key', async () => {
    const job = await service.submitIdentify({
      image,
      userId: 'u1',
      idempotencyKey: 'client-key-123',
    });

    expect(credits.reserve).toHaveBeenCalledTimes(1);
    expect(credits.reserve.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      action: 'identify',
      cost: 2,
      idempotencyKey: 'client-key-123',
    });
    // The service generates the scan ULID and threads the SAME id to the repo and the queue.
    const generatedScanId = repo.createIdentifyScan.mock.calls[0][0].scanId;
    expect(queue.enqueueIdentify).toHaveBeenCalledWith({
      scanId: generatedScanId,
      usageRecordId: 'ur1',
    });
    expect(job).toMatchObject({
      id: 'pub-uuid',
      type: 'identify',
      status: 'pending',
      species: null,
    });
  });

  it('authenticated without an Idempotency-Key is rejected (no debit, no scan)', async () => {
    await expect(service.submitIdentify({ image, userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
    expect(repo.createIdentifyScan).not.toHaveBeenCalled();
  });

  it('guest: never touches the ledger and enqueues with a null usage record', async () => {
    const job = await service.submitIdentify({ image, userId: null });
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(config.getCreditCosts).not.toHaveBeenCalled();
    const generatedScanId = repo.createIdentifyScan.mock.calls[0][0].scanId;
    expect(queue.enqueueIdentify).toHaveBeenCalledWith({
      scanId: generatedScanId,
      usageRecordId: null,
    });
    expect(job.status).toBe('pending');
  });

  it('enqueue failure: fails the scan, refunds the reserved credit, and rejects', async () => {
    queue.enqueueIdentify.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      service.submitIdentify({ image, userId: 'u1', idempotencyKey: 'k1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const generatedScanId = repo.createIdentifyScan.mock.calls[0][0].scanId;
    expect(repo.markFailed).toHaveBeenCalledWith(generatedScanId, expect.any(Object));
    expect(credits.refundUsage).toHaveBeenCalledWith('ur1');
  });
});

describe('IdentifyService.process (T-020, FR-003/FR-017)', () => {
  const makeRepo = () => ({
    getPhotoStorageKey: vi.fn().mockResolvedValue('key/1'),
    findSpeciesById: vi.fn(),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  });
  const storage = { getBytes: vi.fn().mockResolvedValue(Buffer.from('img')) };

  const build = (
    repo: ReturnType<typeof makeRepo>,
    ai: { identify: ReturnType<typeof vi.fn> },
    credits: { complete: ReturnType<typeof vi.fn>; refundUsage: ReturnType<typeof vi.fn> },
  ) =>
    new IdentifyService(
      repo as unknown as ScansRepository,
      ai as unknown as AiGatewayService,
      storage as unknown as StorageService,
      credits as unknown as CreditsService,
    );

  it('low confidence: withholds the species and marks completed with the low-confidence prompt', async () => {
    const repo = makeRepo();
    const ai = {
      identify: vi
        .fn()
        .mockResolvedValue({
          confidence: 0.6,
          speciesId: null,
          careGuide: null,
          lowConfidence: true,
        }),
    };
    const credits = { complete: vi.fn().mockResolvedValue(undefined), refundUsage: vi.fn() };

    await build(repo, ai, credits).process({ scanId: 'S', usageRecordId: 'ur1' });

    const arg = repo.markCompleted.mock.calls[0][1];
    expect(arg.speciesId).toBeNull();
    expect(arg.result.lowConfidence).toBe(true);
    expect(typeof arg.result.message).toBe('string');
    expect(credits.complete).toHaveBeenCalledWith('ur1');
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('high confidence + catalog hit: sets the species FK', async () => {
    const repo = makeRepo();
    repo.findSpeciesById.mockResolvedValue({
      publicId: 'sp-pub',
      scientificName: 'Ficus',
      commonNameFa: 'فیکوس',
      careGuide: {},
    });
    const ai = {
      identify: vi
        .fn()
        .mockResolvedValue({
          confidence: 0.9,
          speciesId: 'sp1',
          careGuide: { water: 'weekly' },
          lowConfidence: false,
        }),
    };
    const credits = { complete: vi.fn().mockResolvedValue(undefined), refundUsage: vi.fn() };

    await build(repo, ai, credits).process({ scanId: 'S', usageRecordId: 'ur1' });

    expect(repo.markCompleted.mock.calls[0][1].speciesId).toBe('sp1');
    expect(credits.complete).toHaveBeenCalledWith('ur1');
  });

  it('high confidence but species not in catalog: leaves species_id null (FK-safe)', async () => {
    const repo = makeRepo();
    repo.findSpeciesById.mockResolvedValue(null);
    const ai = {
      identify: vi
        .fn()
        .mockResolvedValue({
          confidence: 0.9,
          speciesId: 'unknown',
          careGuide: {},
          lowConfidence: false,
        }),
    };
    const credits = { complete: vi.fn().mockResolvedValue(undefined), refundUsage: vi.fn() };

    await build(repo, ai, credits).process({ scanId: 'S', usageRecordId: 'ur1' });

    expect(repo.markCompleted.mock.calls[0][1].speciesId).toBeNull();
  });

  it('AI failure: marks the scan failed and refunds the reserved credit once (FR-017)', async () => {
    const repo = makeRepo();
    const ai = { identify: vi.fn().mockRejectedValue(new Error('provider down')) };
    const credits = { complete: vi.fn(), refundUsage: vi.fn().mockResolvedValue(undefined) };

    await build(repo, ai, credits).process({ scanId: 'S', usageRecordId: 'ur1' });

    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    expect(credits.refundUsage).toHaveBeenCalledWith('ur1');
    expect(credits.complete).not.toHaveBeenCalled();
  });

  it('guest failure: no refund attempted (no credit was reserved)', async () => {
    const repo = makeRepo();
    const ai = { identify: vi.fn().mockRejectedValue(new Error('provider down')) };
    const credits = { complete: vi.fn(), refundUsage: vi.fn() };

    await build(repo, ai, credits).process({ scanId: 'S', usageRecordId: null });

    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    expect(credits.refundUsage).not.toHaveBeenCalled();
  });
});
