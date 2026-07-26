import { Injectable, Logger } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { usageRecord } from '../db/schema';
import { CreditsService } from '../credits/credits.service';

const RECONCILE_TIMEOUT_MS = Number(process.env.RECONCILE_TIMEOUT_MS ?? 5 * 60 * 1000);

/**
 * Sweeps usage records stuck in `pending` past the timeout (e.g. a worker crashed
 * mid-AI-call) and refunds them idempotently. This is what turns at-least-once
 * job delivery into an effectively exactly-once credit guarantee without needing
 * distributed transactions — a crashed metered action never silently keeps a debit.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly credits: CreditsService) {}

  /** Returns the number of records refunded. Idempotent (refund-once per record). */
  async sweepStuckUsageRecords(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RECONCILE_TIMEOUT_MS);
    const stuck = await db
      .select({ id: usageRecord.id })
      .from(usageRecord)
      .where(and(eq(usageRecord.status, 'pending'), lt(usageRecord.createdAt, cutoff)));

    let refunded = 0;
    let failed = 0;
    for (const record of stuck) {
      // Isolate each refund: one bad record must not abort the whole sweep. A
      // record that fails here stays `pending` and is retried on the next run.
      try {
        await this.credits.refundUsage(record.id);
        refunded += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Reconciliation failed to refund usage record ${record.id}: ${(err as Error).message}`,
        );
      }
    }
    if (refunded > 0 || failed > 0) {
      this.logger.warn(
        `Reconciliation refunded ${refunded} stuck usage record(s)` +
          (failed > 0 ? `, ${failed} failed (will retry next run).` : '.'),
      );
    }
    return refunded;
  }
}
