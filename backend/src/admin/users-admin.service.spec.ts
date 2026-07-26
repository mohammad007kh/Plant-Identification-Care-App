import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersAdminService } from './users-admin.service';
import type { UsersAdminRepository, AdminUserRow } from './users-admin.repository';
import { ReportsAdminService } from './reports-admin.service';
import type {
  ReportsAdminRepository,
  AdminMisidentificationReportRow,
} from './reports-admin.repository';
import type { StorageService } from '../common/uploads/storage.service';

const targetRow: AdminUserRow = {
  id: 'user-internal-1',
  publicId: 'user-pub-uuid',
  email: 'member@test.local',
  role: 'user',
  status: 'active',
  tier: 'free',
  creditBalance: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('UsersAdminService (T-141, US9, FR-026)', () => {
  let repo: {
    search: ReturnType<typeof vi.fn>;
    findByPublicId: ReturnType<typeof vi.fn>;
    setCreditBalance: ReturnType<typeof vi.fn>;
    updateTier: ReturnType<typeof vi.fn>;
    recordAuditEvent: ReturnType<typeof vi.fn>;
  };
  let service: UsersAdminService;

  beforeEach(() => {
    repo = {
      search: vi.fn(),
      findByPublicId: vi.fn().mockResolvedValue(targetRow),
      setCreditBalance: vi.fn().mockResolvedValue(undefined),
      updateTier: vi.fn().mockResolvedValue(true),
      recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    };
    service = new UsersAdminService(repo as unknown as UsersAdminRepository);
  });

  it('never leaks the internal id or password hash — only the public, minimized summary shape', async () => {
    const result = await service.getOne('user-pub-uuid');
    expect(result).toEqual({
      publicId: 'user-pub-uuid',
      email: 'member@test.local',
      role: 'user',
      status: 'active',
      tier: 'free',
      creditBalance: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('404s when the target user does not exist', async () => {
    repo.findByPublicId.mockResolvedValue(null);
    await expect(service.getOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('a credit adjustment writes an audit record with the acting admin id, reason, and applied change', async () => {
    repo.findByPublicId
      .mockResolvedValueOnce(targetRow)
      .mockResolvedValueOnce({ ...targetRow, creditBalance: 15 });

    const result = await service.act('admin-internal-1', 'user-pub-uuid', {
      creditAdjustment: 5,
      reason: 'goodwill credit after support ticket #42',
    });

    expect(repo.setCreditBalance).toHaveBeenCalledWith('user-internal-1', 15);
    expect(repo.recordAuditEvent).toHaveBeenCalledWith({
      actingAdminUserId: 'admin-internal-1',
      targetUserId: 'user-internal-1',
      reason: 'goodwill credit after support ticket #42',
      changes: { creditAdjustment: 5, newCreditBalance: 15 },
    });
    expect(result.creditBalance).toBe(15);
  });

  it('a tier change writes an audit record and calls updateTier', async () => {
    repo.findByPublicId
      .mockResolvedValueOnce(targetRow)
      .mockResolvedValueOnce({ ...targetRow, tier: 'pro' });

    await service.act('admin-internal-1', 'user-pub-uuid', {
      tier: 'pro',
      reason: 'upgraded per support request',
    });

    expect(repo.updateTier).toHaveBeenCalledWith('user-internal-1', 'pro');
    expect(repo.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { tier: 'pro' } }),
    );
  });

  it('rejects (400) a credit adjustment that would drive the balance negative, and never writes an audit record', async () => {
    await expect(
      service.act('admin-internal-1', 'user-pub-uuid', {
        creditAdjustment: -100,
        reason: 'attempted overdraw',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.setCreditBalance).not.toHaveBeenCalled();
    expect(repo.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('404s an action on an unknown target user, before any write is attempted', async () => {
    repo.findByPublicId.mockResolvedValue(null);
    await expect(
      service.act('admin-internal-1', 'missing', { creditAdjustment: 1, reason: 'x' }),
    ).rejects.toThrow(NotFoundException);
    expect(repo.recordAuditEvent).not.toHaveBeenCalled();
  });
});

const reportRow: AdminMisidentificationReportRow = {
  id: 'report-internal-1',
  publicId: 'report-pub-uuid',
  status: 'open',
  note: 'wrong species',
  aiResult: { species: 'Ficus lyrata', confidence: 0.9 },
  photoStorageKey: 'photos/abc',
  scanPublicId: 'scan-pub-uuid',
  reporterPublicId: 'reporter-pub-uuid',
  createdAt: new Date('2026-02-01T00:00:00Z'),
};

describe('ReportsAdminService (T-141, US9, FR-025) — report list shape', () => {
  it('includes a signed photo URL and the snapshotted AI result', async () => {
    const repo = { list: vi.fn().mockResolvedValue({ rows: [reportRow], nextCursor: null }) };
    const storage = {
      getSignedUrl: vi.fn().mockReturnValue('/v1/photos/photos%2Fabc?expires=1&signature=sig'),
    };
    const service = new ReportsAdminService(
      repo as unknown as ReportsAdminRepository,
      storage as unknown as StorageService,
    );

    const page = await service.list(null, 20);

    expect(storage.getSignedUrl).toHaveBeenCalledWith('photos/abc');
    expect(page.data).toEqual([
      {
        id: 'report-pub-uuid',
        status: 'open',
        note: 'wrong species',
        aiResult: { species: 'Ficus lyrata', confidence: 0.9 },
        photoUrl: '/v1/photos/photos%2Fabc?expires=1&signature=sig',
        scanId: 'scan-pub-uuid',
        reporterUserId: 'reporter-pub-uuid',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('a report with no resolvable photo gets photoUrl: null, never a call to the signer', async () => {
    const repo = {
      list: vi
        .fn()
        .mockResolvedValue({ rows: [{ ...reportRow, photoStorageKey: null }], nextCursor: null }),
    };
    const storage = { getSignedUrl: vi.fn() };
    const service = new ReportsAdminService(
      repo as unknown as ReportsAdminRepository,
      storage as unknown as StorageService,
    );

    const page = await service.list(null, 20);

    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(page.data[0].photoUrl).toBeNull();
  });
});
