import { Injectable } from '@nestjs/common';
import type { AdminMisidentificationReport } from 'shared';
import { StorageService } from '../common/uploads/storage.service';
import {
  ReportsAdminRepository,
  type AdminMisidentificationReportRow,
} from './reports-admin.repository';

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Admin misidentification-report triage READ side (US9, FR-025). Pure
 * orchestration over `ReportsAdminRepository` — no direct Drizzle access here
 * (repository pattern). Resolves each report's photo to a signed URL via
 * `StorageService` (never a raw storage key/bucket path) so the admin UI can
 * render the reported photo without direct bucket access.
 */
@Injectable()
export class ReportsAdminService {
  constructor(
    private readonly repo: ReportsAdminRepository,
    private readonly storage: StorageService,
  ) {}

  async list(
    cursor: string | null,
    limit: number,
  ): Promise<CursorPage<AdminMisidentificationReport>> {
    const { rows, nextCursor } = await this.repo.list(cursor, limit);
    return { data: rows.map((row) => this.toDto(row)), nextCursor };
  }

  private toDto(row: AdminMisidentificationReportRow): AdminMisidentificationReport {
    return {
      id: row.publicId,
      status: row.status,
      note: row.note,
      aiResult: row.aiResult,
      photoUrl: row.photoStorageKey ? this.storage.getSignedUrl(row.photoStorageKey) : null,
      scanId: row.scanPublicId,
      reporterUserId: row.reporterPublicId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
