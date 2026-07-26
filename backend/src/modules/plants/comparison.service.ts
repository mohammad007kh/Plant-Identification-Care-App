import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { HealthVerdict } from 'shared';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { AppConfigService } from '../../common/config/app-config.service';
import { StorageService } from '../../common/uploads/storage.service';
import { ComparisonRepository } from './comparison.repository';
import type { ComparisonJobData } from './comparison.queue';

/** Persian user-facing prompts (FR-011 follow-up-needed, FR-017 retry-on-failure). */
const FOLLOW_UP_NEEDED_MESSAGE = 'برای مقایسه روند سلامت، به حداقل یک عکس پیگیری دیگر نیاز است.';
const FAILURE_MESSAGE =
  'مقایسه سلامت گیاه با خطا مواجه شد. اعتبار شما بازگردانده شد؛ لطفاً دوباره تلاش کنید.';

export interface ComparisonResultDto {
  verdict: HealthVerdict;
  referencedPhotoIds: string[];
}

/**
 * Business logic of the async comparison job — kept separate from the BullMQ
 * `Worker` wiring (comparison.worker) so it can be invoked directly in tests
 * without a live queue (mirrors IdentifyService/IdentifyWorker, T-020).
 *
 * The <2-photo "follow-up needed" rule (FR-011) is enforced BEFORE any credit
 * is reserved (pre-check per Station 10 — a comparison that cannot run must
 * never charge). Only a real ≥2-photo comparison goes through
 * `AiGatewayService.runMeteredAction` (action=comparison), which reserves
 * credit, runs the AI call, and refunds-once on failure (FR-015/FR-017). On any
 * terminal error the scan is marked `failed`; the error is NOT rethrown (a
 * BullMQ retry would re-run an already-refunded job).
 */
@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  constructor(
    private readonly repo: ComparisonRepository,
    private readonly ai: AiGatewayService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  async process(data: ComparisonJobData): Promise<void> {
    const { scanId } = data;

    const scanRow = await this.repo.findScanForProcessing(scanId);
    if (!scanRow || !scanRow.userId || !scanRow.plantId) {
      // Defensive: every comparison scan is created (T-060) with a userId +
      // plantId already attached, so this should never happen in practice.
      this.logger.error(`comparison job for scan ${scanId} has no owning user/plant`);
      await this.safeMarkFailed(scanId);
      return;
    }
    const { userId, plantId } = scanRow;

    // Fewer-than-two-photos rule (FR-011): checked BEFORE any credit
    // reservation so an incomplete photo history never charges the user.
    const recentPhotos = await this.repo.getRecentPhotos(plantId, userId, 2);
    if (recentPhotos.length < 2) {
      await this.repo.markFollowUpNeeded(scanId, FOLLOW_UP_NEEDED_MESSAGE);
      return;
    }
    const [latest, previous] = recentPhotos;

    try {
      const [previousBuffer, latestBuffer] = await Promise.all([
        this.storage.getBytes(previous.storageKey),
        this.storage.getBytes(latest.storageKey),
      ]);
      const costs = await this.config.getCreditCosts();

      const { verdict } = await this.ai.runMeteredAction({
        userId,
        action: 'comparison',
        cost: costs.comparison,
        // Deterministic per-scan key: a BullMQ retry of the SAME job hits the
        // existing reservation instead of debiting credit a second time.
        idempotencyKey: `comparison:${scanId}`,
        work: () => this.ai.compareHealth(previousBuffer, latestBuffer),
      });

      await this.repo.persistResult({
        scanId,
        plantId,
        verdict,
        referencedPhotoIds: [previous.publicId, latest.publicId],
      });
    } catch (err) {
      this.logger.error(`comparison job for scan ${scanId} failed: ${(err as Error).message}`);
      // runMeteredAction already refunded the reservation; only the scan
      // status needs updating here.
      await this.safeMarkFailed(scanId);
    }
  }

  /**
   * Tenancy-scoped result fetch (Objective: "result-fetch path"). Not yet
   * wired to an HTTP route — T-107 exposes it via `GET /v1/scans/:id`; this
   * method is ready to call as-is. Another user's scan/plant → 404, never a
   * raw "not found" that could leak existence of someone else's data.
   */
  async getResult(userId: string, scanPublicId: string): Promise<ComparisonResultDto> {
    const row = await this.repo.findResultForUser(userId, scanPublicId);
    if (!row) throw new NotFoundException('comparison result not found');
    return { verdict: row.verdict, referencedPhotoIds: row.referencedPhotoIds ?? [] };
  }

  /** Wraps markFailed so a blip here never skips past (it's already the terminal step). */
  private async safeMarkFailed(scanId: string): Promise<void> {
    try {
      await this.repo.markFailed(scanId, FAILURE_MESSAGE);
    } catch (markErr) {
      this.logger.error(`markFailed for scan ${scanId} failed: ${(markErr as Error).message}`);
    }
  }
}
