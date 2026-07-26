import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MisidentificationReport } from 'shared';
import { ScansRepository } from '../scans/scans.repository';
import { MisidentificationReportsRepository } from './misidentification-reports.repository';

export interface SubmitMisidentificationReportParams {
  /** Public (opaque UUID) id of the reported scan, as supplied by the caller. */
  scanPublicId: string;
  note?: string;
  /** Authenticated caller's internal user id, or null for a guest. */
  requesterUserId: string | null;
}

/**
 * Write side of FR-025 misidentification reporting (US1/US9). Guest-allowed:
 * resolves the reported scan via `ScansRepository` (T-020, read-only reuse —
 * no naked scan-table access here), enforces ownership only when the caller is
 * authenticated (guest-owned scans are reportable by anyone holding the scan's
 * public id, matching the no-login UX of US1), snapshots the scan's current AI
 * result so later catalog edits never retroactively change what admins review,
 * and persists via `MisidentificationReportsRepository`. Never touches the
 * credit ledger — reporting is not an AI-powered action.
 */
@Injectable()
export class MisidentificationReportsService {
  constructor(
    private readonly repo: MisidentificationReportsRepository,
    private readonly scansRepo: ScansRepository,
  ) {}

  async submitReport(
    params: SubmitMisidentificationReportParams,
  ): Promise<MisidentificationReport> {
    const { scanPublicId, note, requesterUserId } = params;

    const scan = await this.scansRepo.findRawByPublicId(scanPublicId);
    if (!scan) {
      throw new NotFoundException({
        code: 'scan_not_found',
        message: 'the reported scan does not exist',
      });
    }

    // Ownership check only applies to authenticated callers reporting on a
    // user-owned scan that isn't theirs; guest-owned scans (scan.userId null)
    // and unauthenticated callers are always allowed to report (US1 no-login UX).
    if (requesterUserId && scan.userId && scan.userId !== requesterUserId) {
      throw new ForbiddenException({
        code: 'scan_not_owned',
        message: 'this scan does not belong to the authenticated user',
      });
    }

    const created = await this.repo.create({
      userId: requesterUserId,
      scanId: scan.id,
      photoId: scan.photoId,
      aiResult: scan.result ?? null,
      note: note ?? null,
    });

    return { id: created.publicId, status: created.status };
  }
}
