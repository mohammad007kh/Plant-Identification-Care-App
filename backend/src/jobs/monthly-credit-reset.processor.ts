import { Injectable, Logger } from '@nestjs/common';
import { CreditsService } from '../credits/credits.service';
import { MonthlyCreditResetRepository } from './monthly-credit-reset.repository';

const DEFAULT_BATCH_SIZE = 200;

/**
 * Monthly credit-reset business logic (T-082, FR-016/FR-019). Grants each
 * user their subscription tier's CURRENT `monthly_credit_allowance` as a
 * ledger `grant` row — never a direct `credit_balance` overwrite — idempotent
 * per `(userId, cycleKey)`, so a retry or a re-run against an already-processed
 * cycle is a no-op. Deliberately a plain injectable service (not a BullMQ
 * consumer) so it is testable directly, without any real scheduler — see
 * `MonthlyCreditResetScheduler` for the BullMQ wiring.
 */
@Injectable()
export class MonthlyCreditResetProcessor {
  private readonly logger = new Logger(MonthlyCreditResetProcessor.name);
  private readonly batchSize: number;

  constructor(
    private readonly repo: MonthlyCreditResetRepository,
    private readonly credits: CreditsService,
  ) {
    this.batchSize = Number(process.env.MONTHLY_RESET_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  }

  /** UTC year-month key identifying the billing cycle a run grants, e.g. `'2026-07'`. */
  static cycleKeyFor(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Resets ONE user's monthly allowance for `cycleKey`. A user with no
   * assigned tier is implicitly on `free` (no default tier is set at
   * registration yet) — resolved live against the tier's CURRENT allowance
   * (FR-019: an admin's allowance change applies to the next reset, never
   * retroactively).
   */
  async resetUser(userId: string, tierId: string | null, cycleKey: string): Promise<void> {
    const allowance = tierId
      ? await this.repo.findTierAllowanceById(tierId)
      : await this.repo.findTierAllowanceByKey('free');
    if (allowance === null) {
      this.logger.warn(`monthly reset skipped for user ${userId}: no resolvable tier allowance`);
      return;
    }
    await this.credits.grantMonthlyReset(userId, allowance, cycleKey);
  }

  /**
   * Processes every user for `cycleKey` in bounded batches (never the whole
   * table at once). Each user's grant is isolated: one failure is logged and
   * the run continues — at-least-once safe, since a later retry of the same
   * user+cycle is a no-op thanks to the ledger idempotency key.
   */
  async runCycle(cycleKey: string): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    let cursor: string | null = null;

    for (;;) {
      const batch = await this.repo.findUserBatch(cursor, this.batchSize);
      if (batch.length === 0) break;

      for (const user of batch) {
        try {
          await this.resetUser(user.id, user.subscriptionTierId, cycleKey);
          processed += 1;
        } catch (err) {
          failed += 1;
          this.logger.error(`monthly reset failed for user ${user.id}: ${(err as Error).message}`);
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < this.batchSize) break;
    }

    return { processed, failed };
  }
}
