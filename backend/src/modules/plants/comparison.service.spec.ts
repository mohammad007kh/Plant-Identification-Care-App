import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ComparisonService } from './comparison.service';
import type { ComparisonRepository } from './comparison.repository';
import type { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type { StorageService } from '../../common/uploads/storage.service';
import type { AppConfigService } from '../../common/config/app-config.service';

const makeRepo = () => ({
  findScanForProcessing: vi.fn(),
  getRecentPhotos: vi.fn(),
  markFollowUpNeeded: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  persistResult: vi.fn().mockResolvedValue(undefined),
  findResultForUser: vi.fn(),
});

const storage = { getBytes: vi.fn().mockResolvedValue(Buffer.from('img')) };
const config = {
  getCreditCosts: vi.fn().mockResolvedValue({ identify: 2, chat: 1, comparison: 3 }),
};

function build(
  repo: ReturnType<typeof makeRepo>,
  ai: { runMeteredAction: ReturnType<typeof vi.fn>; compareHealth: ReturnType<typeof vi.fn> },
): ComparisonService {
  return new ComparisonService(
    repo as unknown as ComparisonRepository,
    ai as unknown as AiGatewayService,
    storage as unknown as StorageService,
    config as unknown as AppConfigService,
  );
}

describe('ComparisonService.process (T-100, FR-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getBytes.mockResolvedValue(Buffer.from('img'));
    config.getCreditCosts.mockResolvedValue({ identify: 2, chat: 1, comparison: 3 });
  });

  it('>=2 photos: computes a verdict referencing the two most recent photos and charges once', async () => {
    const repo = makeRepo();
    repo.findScanForProcessing.mockResolvedValue({ id: 'S', userId: 'u1', plantId: 'p1' });
    repo.getRecentPhotos.mockResolvedValue([
      { id: 'ph2', publicId: 'pub-2', storageKey: 'k2', createdAt: new Date('2026-01-02') },
      { id: 'ph1', publicId: 'pub-1', storageKey: 'k1', createdAt: new Date('2026-01-01') },
    ]);
    const ai = {
      runMeteredAction: vi
        .fn()
        .mockImplementation((params: { work: () => Promise<unknown> }) => params.work()),
      compareHealth: vi.fn().mockResolvedValue({ verdict: 'improved' }),
    };

    await build(repo, ai).process({ scanId: 'S' });

    expect(ai.runMeteredAction).toHaveBeenCalledTimes(1);
    expect(ai.runMeteredAction.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      action: 'comparison',
      cost: 3,
      idempotencyKey: 'comparison:S',
    });
    expect(ai.compareHealth).toHaveBeenCalledWith(Buffer.from('img'), Buffer.from('img'));
    expect(repo.persistResult).toHaveBeenCalledWith({
      scanId: 'S',
      plantId: 'p1',
      verdict: 'improved',
      referencedPhotoIds: ['pub-1', 'pub-2'],
    });
    expect(repo.markFollowUpNeeded).not.toHaveBeenCalled();
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('<2 photos: marks the scan "follow-up needed" and never reserves credit (no charge)', async () => {
    const repo = makeRepo();
    repo.findScanForProcessing.mockResolvedValue({ id: 'S', userId: 'u1', plantId: 'p1' });
    repo.getRecentPhotos.mockResolvedValue([
      { id: 'ph1', publicId: 'pub-1', storageKey: 'k1', createdAt: new Date() },
    ]);
    const ai = { runMeteredAction: vi.fn(), compareHealth: vi.fn() };

    await build(repo, ai).process({ scanId: 'S' });

    expect(repo.markFollowUpNeeded).toHaveBeenCalledWith('S', expect.any(String));
    expect(ai.runMeteredAction).not.toHaveBeenCalled();
    expect(config.getCreditCosts).not.toHaveBeenCalled();
    expect(repo.persistResult).not.toHaveBeenCalled();
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('0 photos: also marks "follow-up needed" (never treated as an error)', async () => {
    const repo = makeRepo();
    repo.findScanForProcessing.mockResolvedValue({ id: 'S', userId: 'u1', plantId: 'p1' });
    repo.getRecentPhotos.mockResolvedValue([]);
    const ai = { runMeteredAction: vi.fn(), compareHealth: vi.fn() };

    await build(repo, ai).process({ scanId: 'S' });

    expect(repo.markFollowUpNeeded).toHaveBeenCalledTimes(1);
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('AI failure: marks the scan failed (refund already handled by runMeteredAction, FR-017)', async () => {
    const repo = makeRepo();
    repo.findScanForProcessing.mockResolvedValue({ id: 'S', userId: 'u1', plantId: 'p1' });
    repo.getRecentPhotos.mockResolvedValue([
      { id: 'ph2', publicId: 'pub-2', storageKey: 'k2', createdAt: new Date('2026-01-02') },
      { id: 'ph1', publicId: 'pub-1', storageKey: 'k1', createdAt: new Date('2026-01-01') },
    ]);
    const ai = {
      runMeteredAction: vi.fn().mockRejectedValue(new Error('provider down')),
      compareHealth: vi.fn(),
    };

    await build(repo, ai).process({ scanId: 'S' });

    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    expect(repo.markFailed).toHaveBeenCalledWith('S', expect.any(String));
    expect(repo.persistResult).not.toHaveBeenCalled();
  });

  it('missing owning user/plant on the scan row: marks failed defensively, never throws', async () => {
    const repo = makeRepo();
    repo.findScanForProcessing.mockResolvedValue(null);
    const ai = { runMeteredAction: vi.fn(), compareHealth: vi.fn() };

    await expect(build(repo, ai).process({ scanId: 'S' })).resolves.toBeUndefined();
    expect(repo.markFailed).toHaveBeenCalledWith('S', expect.any(String));
    expect(ai.runMeteredAction).not.toHaveBeenCalled();
  });
});

describe('ComparisonService.getResult (T-100, tenancy)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("another user's scan/plant → 404 (never a raw not-found leak)", async () => {
    const repo = makeRepo();
    repo.findResultForUser.mockResolvedValue(null);
    const ai = { runMeteredAction: vi.fn(), compareHealth: vi.fn() };

    await expect(build(repo, ai).getResult('attacker', 'scan-pub')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findResultForUser).toHaveBeenCalledWith('attacker', 'scan-pub');
  });

  it('owned scan: returns the persisted verdict + referenced photo ids', async () => {
    const repo = makeRepo();
    repo.findResultForUser.mockResolvedValue({ verdict: 'worse', referencedPhotoIds: ['a', 'b'] });
    const ai = { runMeteredAction: vi.fn(), compareHealth: vi.fn() };

    const result = await build(repo, ai).getResult('u1', 'scan-pub');
    expect(result).toEqual({ verdict: 'worse', referencedPhotoIds: ['a', 'b'] });
  });
});
