import { Injectable } from '@nestjs/common';
import { db } from '../../db/client';
import { misidentificationReport } from '../../db/schema';

export interface CreateMisidentificationReportParams {
  /** Reporting user's internal id, or null for a guest-submitted report. */
  userId: string | null;
  /** Internal (ULID) id of the reported scan. */
  scanId: string;
  /** Internal (ULID) id of the scan's photo, or null when unresolved. */
  photoId: string | null;
  /** Snapshot of the scan's AI result at report time (never re-read later). */
  aiResult: unknown;
  note: string | null;
}

export interface MisidentificationReportRow {
  publicId: string;
  status: 'open' | 'reviewed';
}

/**
 * All Drizzle access for the `misidentification_report` table (repository
 * pattern — no naked ORM queries in the service/controller per
 * `code_patterns.data_access`).
 */
@Injectable()
export class MisidentificationReportsRepository {
  async create(params: CreateMisidentificationReportParams): Promise<MisidentificationReportRow> {
    const [row] = await db
      .insert(misidentificationReport)
      .values({
        userId: params.userId,
        scanId: params.scanId,
        photoId: params.photoId,
        aiResult: params.aiResult,
        note: params.note,
      })
      .returning({
        publicId: misidentificationReport.publicId,
        status: misidentificationReport.status,
      });
    return row;
  }
}
