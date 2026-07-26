import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { CreditBalance } from 'shared';
import { db } from '../db/client';
import { creditTransaction, usageRecord } from '../db/schema';
import {
  CreditLedgerRepository,
  type CreditRelatedType,
  type Tx,
} from './credit-ledger.repository';
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

  /** Balance + current tier (T-080, `GET /v1/credits/balance`). */
  getBalanceAndTier(userId: string): Promise<CreditBalance> {
    return this.ledger.getBalanceAndTier(userId);
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

  /**
   * Atomic grant + tier change (T-081, verified-payment success path — used by
   * `PaymentsService` outside of any caller-supplied transaction). The credit
   * grant and the `user.subscription_tier_id` change happen in ONE DB
   * transaction; idempotent by `idempotencyKey` (payment_event's own key).
   */
  grantAndSetTier(
    userId: string,
    opts: { amount: number; tierId: string; idempotencyKey: string },
  ) {
    return this.ledger.creditAndSetTier({
      userId,
      amount: opts.amount,
      tierId: opts.tierId,
      type: 'grant',
      relatedType: 'subscription',
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /**
   * Tx-aware variant of `grantAndSetTier`, for callers (PaymentsService) that
   * must also update OTHER tables (e.g. `payment_event.status`) in the exact
   * same transaction as the grant + tier change.
   */
  grantAndSetTierTx(
    tx: Tx,
    userId: string,
    opts: { amount: number; tierId: string; idempotencyKey: string },
  ) {
    return this.ledger.creditAndSetTierTx(tx, {
      userId,
      amount: opts.amount,
      tierId: opts.tierId,
      type: 'grant',
      relatedType: 'subscription',
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /**
   * Monthly credit-reset grant (T-082, FR-019): a ledger `grant` row idempotent
   * per `(userId, cycleKey)` — NEVER a direct `credit_balance` overwrite, so the
   * invariant `credit_balance == SUM(ledger)` stays intact. Safe to retry/re-run
   * for an already-processed cycle (no double grant).
   */
  grantMonthlyReset(userId: string, tierAllowance: number, cycleKey: string) {
    return this.grant(userId, tierAllowance, {
      idempotencyKey: `monthly_reset:${userId}:${cycleKey}`,
      relatedType: 'monthly_reset',
    });
  }

  /**
   * Reserve credit for an ASYNC metered action (e.g. a BullMQ scan job): a
   * conditional debit + a `pending` usage_record, committed atomically. Returns
   * the usage_record id so a later worker can `complete` it on success or
   * `refundUsage` it on failure. The idempotency key identifies ONE attempt — a
   * repeat is a 409 conflict, never a silent second debit. Throws
   * InsufficientCreditException when the balance is too low (→ RFC7807 402).
   */
  async reserve(params: {
    userId: string;
    action: UsageAction;
    cost: number;
    idempotencyKey: string;
  }): Promise<{ usageRecordId: string }> {
    const { userId, action, cost, idempotencyKey } = params;
    try {
      const usageRecordId = await db.transaction(async (tx) => {
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
          .values({ userId, action, status: 'pending', debitTxnId: debit.txnId, idempotencyKey })
          .returning({ id: usageRecord.id });

        return record.id;
      });
      return { usageRecordId };
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
  }

  /** Mark a reserved usage_record `completed` (async success path). */
  async complete(usageRecordId: string): Promise<void> {
    await db
      .update(usageRecord)
      .set({ status: 'completed', resolvedAt: new Date() })
      .where(eq(usageRecord.id, usageRecordId));
  }

  /**
   * Sync metered action: reserve → run `work()` inline → complete on success or
   * refund-once on failure. For async work (a job runs the AI call later), use
   * `reserve` + `complete`/`refundUsage` directly instead.
   */
  async runMeteredAction<T>(params: MeteredActionParams<T>): Promise<T> {
    const { userId, action, cost, idempotencyKey, work } = params;
    const { usageRecordId } = await this.reserve({ userId, action, cost, idempotencyKey });

    try {
      const result = await work();
      await this.complete(usageRecordId);
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
