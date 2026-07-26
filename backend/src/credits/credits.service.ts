import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { creditTransaction, usageRecord } from '../db/schema';
import { CreditLedgerRepository, type CreditRelatedType } from './credit-ledger.repository';
import { isUniqueViolation } from './db-errors';

export type UsageAction = 'identify' | 'comparison' | 'chat';

const ACTION_TO_RELATED: Readonly<Record<UsageAction, CreditRelatedType>> = {
  identify: 'scan',
  comparison: 'comparison',
  chat: 'chat_message',
};

export interface MeteredActionParams<T> {
  userId: string;
  action: UsageAction;
  cost: number;
  /** Unique per request — makes the debit + usage record idempotent across retries. */
  idempotencyKey: string;
  /** The AI call. Runs OUTSIDE the reserve transaction; a throw triggers a refund. */
  work: () => Promise<T>;
}

/**
 * Credit metering. The ONLY sanctioned path for a metered AI action is
 * `runMeteredAction`: it reserves credit (conditional debit + a `pending`
 * usage_record) in one transaction, runs the AI work outside the transaction,
 * then marks the record `completed` on success or refunds-once + marks `failed`
 * on error/timeout (FR-015 / FR-017). A background reconciliation sweep
 * (jobs/reconciliation.worker) refunds records stuck `pending` past a timeout,
 * turning at-least-once job delivery into an effectively exactly-once guarantee.
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly ledger: CreditLedgerRepository) {}

  getBalance(userId: string): Promise<number> {
    return this.ledger.getBalance(userId);
  }

  debit(
    userId: string,
    amount: number,
    opts: { idempotencyKey: string; relatedType?: CreditRelatedType; relatedId?: string },
  ) {
    return this.ledger.debit({ userId, amount, ...opts });
  }

  grant(
    userId: string,
    amount: number,
    opts: { idempotencyKey: string; relatedType?: CreditRelatedType; relatedId?: string },
  ) {
    return this.ledger.credit({ userId, amount, type: 'grant', ...opts });
  }

  async runMeteredAction<T>(params: MeteredActionParams<T>): Promise<T> {
    const { userId, action, cost, idempotencyKey, work } = params;

    // Reserve: conditional debit + a `pending` usage_record, atomically.
    // The idempotency key identifies ONE metered attempt. A repeat of the same
    // key (client double-submit, at-least-once job redelivery, replay) must NOT
    // re-run the paid `work()` — doing so would deliver a second billed AI call
    // for free and corrupt the usage-record state machine. A genuine retry after
    // a failure is a NEW attempt and must carry a fresh key. So: any pre-existing
    // record for this key is a conflict, not a resume.
    let usageRecordId: string;
    try {
      usageRecordId = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: usageRecord.id })
          .from(usageRecord)
          .where(eq(usageRecord.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing.length > 0) {
          throw new ConflictException({
            code: 'metered_action_exists',
            message: 'a metered action already exists for this idempotency key',
          });
        }

        const debit = await this.ledger.debitTx(tx, {
          userId,
          amount: cost,
          idempotencyKey: `debit:${idempotencyKey}`,
          relatedType: ACTION_TO_RELATED[action],
        });

        const [record] = await tx
          .insert(usageRecord)
          .values({
            userId,
            action,
            status: 'pending',
            debitTxnId: debit.txnId,
            idempotencyKey,
          })
          .returning({ id: usageRecord.id });

        return record.id;
      });
    } catch (err) {
      // TOCTOU: a concurrent request with the same key won the insert race.
      // Postgres rolled our reserve tx back (ledger stays consistent) — surface
      // the same idempotent conflict instead of a raw 500.
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'metered_action_exists',
          message: 'a metered action already exists for this idempotency key',
        });
      }
      throw err;
    }

    try {
      const result = await work();
      await db
        .update(usageRecord)
        .set({ status: 'completed', resolvedAt: new Date() })
        .where(eq(usageRecord.id, usageRecordId));
      return result;
    } catch (err) {
      // Refund the reserved credit, but never let a refund hiccup mask the real
      // failure the caller needs to see.
      try {
        await this.refundUsage(usageRecordId);
      } catch (refundErr) {
        this.logger.error(
          `refund after failed metered action ${usageRecordId} did not complete: ${(refundErr as Error).message}`,
        );
      }
      throw err;
    }
  }

  /**
   * Idempotent refund of a usage record. Refund amount is derived from the linked
   * debit transaction (so the reconciliation sweep can refund stuck records
   * without knowing the original cost). Refund-once: guarded by refund_txn_id.
   */
  async refundUsage(usageRecordId: string): Promise<void> {
    try {
      await this.refundUsageTx(usageRecordId);
    } catch (err) {
      // A concurrent refunder (the failing request AND the reconciliation sweep
      // can both target the same stuck record) committed the refund first; its
      // unique `refund:<id>` key made our insert conflict and roll back. The
      // refund happened exactly once — treat our attempt as a no-op.
      if (isUniqueViolation(err)) return;
      throw err;
    }
  }

  private async refundUsageTx(usageRecordId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: usageRecord.id,
          userId: usageRecord.userId,
          debitTxnId: usageRecord.debitTxnId,
          refundTxnId: usageRecord.refundTxnId,
        })
        .from(usageRecord)
        .where(eq(usageRecord.id, usageRecordId))
        .limit(1);
      if (!record || record.refundTxnId || !record.debitTxnId) {
        return; // already refunded, unknown, or never debited — refund-once
      }

      const [debit] = await tx
        .select({ amount: creditTransaction.amount })
        .from(creditTransaction)
        .where(eq(creditTransaction.id, record.debitTxnId))
        .limit(1);
      if (!debit) return;
      const cost = Math.abs(debit.amount);

      const refund = await this.ledger.creditTx(tx, {
        userId: record.userId,
        amount: cost,
        type: 'refund',
        relatedId: usageRecordId,
        idempotencyKey: `refund:${usageRecordId}`,
      });

      await tx
        .update(usageRecord)
        .set({ status: 'failed', refundTxnId: refund.txnId, resolvedAt: new Date() })
        .where(eq(usageRecord.id, usageRecordId));
    });
  }
}
