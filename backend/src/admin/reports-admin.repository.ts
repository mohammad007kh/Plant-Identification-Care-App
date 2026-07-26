import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { misidentificationReport, photo, scan, users } from '../db/schema';

export interface AdminMisidentificationReportRow {
  /** Internal ULID — used only for cursor encoding, never exposed. */
  id: string;
  publicId: string;
  status: 'open' | 'reviewed';
  note: string | null;
  aiResult: unknown;
  photoStorageKey: string | null;
  scanPublicId: string;
  /** Reporting user's public id, or null for a guest-submitted report. */
  reporterPublicId: string | null;
  createdAt: Date;
}

export interface AdminReportsPage {
  rows: AdminMisidentificationReportRow[];
  nextCursor: string | null;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Pick<AdminMisidentificationReportRow, 'createdAt' | 'id'>): string {
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

const reportColumns = {
  id: misidentificationReport.id,
  publicId: misidentificationReport.publicId,
  status: misidentificationReport.status,
  note: misidentificationReport.note,
  aiResult: misidentificationReport.aiResult,
  photoStorageKey: photo.storageKey,
  scanPublicId: scan.publicId,
  reporterPublicId: users.publicId,
  createdAt: misidentificationReport.createdAt,
};

/**
 * All Drizzle access for the admin misidentification-report triage list (US9,
 * FR-025). Read-only — reports are created by T-022; nothing here mutates
 * `status`. Cross-user by design (Station 17): an admin must see every user's
 * (and every guest's) reports, so there is deliberately no `userId` scoping.
 */
@Injectable()
export class ReportsAdminRepository {
  /** Cursor-paginated report list, ordered by `created_at DESC`. */
  async list(cursor: string | null, limit: number): Promise<AdminReportsPage> {
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      throw new BadRequestException({ code: 'invalid_cursor', message: 'cursor is malformed' });
    }

    const conditions = [];
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      conditions.push(
        or(
          lt(misidentificationReport.createdAt, cursorDate),
          and(
            eq(misidentificationReport.createdAt, cursorDate),
            lt(misidentificationReport.id, decoded.id),
          ),
        ),
      );
    }

    const rows = await db
      .select(reportColumns)
      .from(misidentificationReport)
      .innerJoin(scan, eq(misidentificationReport.scanId, scan.id))
      .leftJoin(photo, eq(misidentificationReport.photoId, photo.id))
      .leftJoin(users, eq(misidentificationReport.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(misidentificationReport.createdAt), desc(misidentificationReport.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
    return { rows: page, nextCursor };
  }
}
