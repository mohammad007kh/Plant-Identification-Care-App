import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { CreditsService } from '../../credits/credits.service';
import { StorageService } from '../../common/uploads/storage.service';
import { ScansRepository } from './scans.repository';
import type { IdentifyJobData } from './identify.queue';

/** Persian user-facing prompts (FR-003 low-confidence, FR-017 retry-on-failure). */
const LOW_CONFIDENCE_MESSAGE =
  'اطمینان کافی برای شناسایی وجود ندارد. لطفاً از یک برگ سالم عکس واضح‌تری بگیرید.';
const FAILURE_MESSAGE =
  'شناسایی گیاه با خطا مواجه شد. اعتبار شما بازگردانده شد؛ لطفاً دوباره تلاش کنید.';

/**
 * Business logic of the async identify job — kept separate from the BullMQ
 * `Worker` wiring (identify.worker) so it can be invoked directly in tests
 * without a live queue (mirrors the ReconciliationService/Worker split).
 *
 * The 70% confidence gate is enforced here (via AiGatewayService, which withholds
 * the species below threshold) — never in the controller. On any terminal AI
 * error the reserved credit is refunded exactly once and the scan is marked
 * failed; the error is NOT rethrown (a BullMQ retry would re-run an
 * already-refunded job).
 */
@Injectable()
export class IdentifyService {
  private readonly logger = new Logger(IdentifyService.name);

  constructor(
    private readonly repo: ScansRepository,
    private readonly ai: AiGatewayService,
    private readonly storage: StorageService,
    private readonly credits: CreditsService,
  ) {}

  async process(data: IdentifyJobData): Promise<void> {
    const { scanId, usageRecordId } = data;
    try {
      const storageKey = await this.repo.getPhotoStorageKey(scanId);
      if (!storageKey) throw new Error(`scan ${scanId} has no photo`);
      const buffer = await this.storage.getBytes(storageKey);

      const result = await this.ai.identify(buffer); // 70% gate applied inside

      if (result.lowConfidence) {
        // Below threshold: never persist a species (data-model invariant #1).
        await this.repo.markCompleted(scanId, {
          speciesId: null,
          confidence: result.confidence,
          result: { lowConfidence: true, message: LOW_CONFIDENCE_MESSAGE },
        });
      } else {
        // Set the species FK only when the AI's match exists in our catalog;
        // otherwise keep the identity in `result` and leave species_id null.
        const inCatalog =
          result.speciesId !== null && (await this.repo.findSpeciesById(result.speciesId)) !== null;
        await this.repo.markCompleted(scanId, {
          speciesId: inCatalog ? result.speciesId : null,
          confidence: result.confidence,
          result: { speciesId: result.speciesId, careGuide: result.careGuide },
        });
      }

      if (usageRecordId) await this.credits.complete(usageRecordId);
    } catch (err) {
      this.logger.error(`identify job for scan ${scanId} failed: ${(err as Error).message}`);
      // Wrap markFailed too: a blip here must not skip the refund below (which
      // would break the never-rethrow invariant and strand the reserved credit
      // until reconciliation). Both are independently guarded.
      try {
        await this.repo.markFailed(scanId, { message: FAILURE_MESSAGE });
      } catch (markErr) {
        this.logger.error(`markFailed for scan ${scanId} failed: ${(markErr as Error).message}`);
      }
      if (usageRecordId) {
        try {
          await this.credits.refundUsage(usageRecordId);
        } catch (refundErr) {
          this.logger.error(
            `refund for usage record ${usageRecordId} failed: ${(refundErr as Error).message}`,
          );
        }
      }
    }
  }
}
