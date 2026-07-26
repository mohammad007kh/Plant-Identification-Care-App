import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ulid } from 'ulid';
import type { ScanJob } from 'shared';
import { AppConfigService } from '../../common/config/app-config.service';
import { StorageService } from '../../common/uploads/storage.service';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';
import { CreditsService } from '../../credits/credits.service';
import { ScansRepository, type ScanRow } from './scans.repository';
import { IdentifyQueue } from './identify.queue';

export interface SubmitIdentifyParams {
  image: NormalizedImage;
  /** Authenticated user id, or null for a guest (guests are not charged). */
  userId: string | null;
  /** Guest session id when unauthenticated (set on scan.guest_session_id). */
  guestSessionId?: string | null;
  /** Optional client Idempotency-Key header — dedupes the credit debit on retry. */
  idempotencyKey?: string;
}

interface ScanResultPayload {
  careGuide?: unknown;
  message?: string;
  lowConfidence?: boolean;
}

const ENQUEUE_FAILURE_MESSAGE =
  'شناسایی گیاه آغاز نشد. اعتبار شما بازگردانده شد؛ لطفاً دوباره تلاش کنید.';

/**
 * Orchestrates the scan pipeline: reserve credit (authenticated only), persist a
 * pending `scan` + `photo`, and enqueue the async identify job. The AI call and
 * 70% gate run later in IdentifyService (via the worker). Guest scans skip the
 * ledger entirely.
 */
@Injectable()
export class ScansService {
  constructor(
    private readonly repo: ScansRepository,
    private readonly storage: StorageService,
    private readonly credits: CreditsService,
    private readonly config: AppConfigService,
    private readonly queue: IdentifyQueue,
  ) {}

  async submitIdentify(params: SubmitIdentifyParams): Promise<ScanJob> {
    const { image, userId, guestSessionId = null, idempotencyKey } = params;
    const scanId = ulid();

    // Authenticated submits are charged, so they MUST be replay-safe: require a
    // client Idempotency-Key (registry `api.idempotency: required`). A retry with
    // the same key hits the existing reservation (409) rather than double-charging.
    // Guests are never charged, so no key is required.
    if (userId && !idempotencyKey) {
      throw new BadRequestException({
        code: 'idempotency_key_required',
        message: 'Idempotency-Key header is required for authenticated scans',
      });
    }

    // Reserve credit BEFORE any storage/DB write, so an insufficient-credit 402
    // (authenticated users only) short-circuits with nothing persisted.
    let usageRecordId: string | null = null;
    if (userId) {
      const costs = await this.config.getCreditCosts();
      const reserved = await this.credits.reserve({
        userId,
        action: 'identify',
        cost: costs.identify,
        idempotencyKey: idempotencyKey as string,
      });
      usageRecordId = reserved.usageRecordId;
    }

    const storageKey = await this.storage.put(image.normalizedBuffer, image.contentType);
    const { publicId } = await this.repo.createIdentifyScan({
      scanId,
      userId,
      guestSessionId,
      storageKey,
      image,
    });

    try {
      await this.queue.enqueueIdentify({ scanId, usageRecordId });
    } catch {
      // Handoff to the worker failed (e.g. Redis down). Resolve the scan now and
      // release the credit instead of leaving a scan stuck `pending` forever
      // (reconciliation would refund the credit, but never resolve the scan row).
      await this.repo.markFailed(scanId, { message: ENQUEUE_FAILURE_MESSAGE });
      if (usageRecordId) {
        try {
          await this.credits.refundUsage(usageRecordId);
        } catch {
          // Reconciliation sweep is the backstop if the immediate refund also fails.
        }
      }
      throw new ServiceUnavailableException({
        code: 'scan_enqueue_failed',
        message: 'could not start identification; please retry',
      });
    }

    return {
      id: publicId,
      type: 'identify',
      status: 'pending',
      confidence: null,
      species: null,
      careGuide: null,
      lowConfidence: false,
      message: null,
    };
  }

  async getByPublicId(publicId: string): Promise<ScanJob> {
    const row = await this.repo.findByPublicId(publicId);
    if (!row) throw new NotFoundException('scan not found');
    return this.toScanJob(row);
  }

  private async toScanJob(row: ScanRow): Promise<ScanJob> {
    const result = (row.result ?? {}) as ScanResultPayload;

    let species: unknown = null;
    if (row.speciesId) {
      const s = await this.repo.findSpeciesById(row.speciesId);
      if (s) {
        species = {
          id: s.publicId,
          scientificName: s.scientificName,
          commonNameFa: s.commonNameFa,
        };
      }
    }

    return {
      id: row.publicId,
      type: row.type,
      status: row.status,
      confidence: row.confidence === null ? null : Number(row.confidence),
      species,
      careGuide: result.careGuide ?? null,
      lowConfidence: result.lowConfidence === true,
      message: result.message ?? null,
    };
  }
}
