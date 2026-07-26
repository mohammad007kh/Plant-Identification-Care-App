import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../credits/credit-ledger.repository';
import { db } from '../../db/client';
import { paymentEvent, subscriptionTier } from '../../db/schema';

export interface TierForCheckout {
  /** Internal (ULID) id — stored on `payment_event.plan_id` / `users.subscription_tier_id`. */
  id: string;
  priceMinor: number;
  monthlyCreditAllowance: number;
}

export interface PaymentEventRow {
  id: string;
  userId: string;
  planId: string | null;
  providerRef: string | null;
  priceSnapshotMinor: number;
  creditAllowanceSnapshot: number;
  status: 'initiated' | 'verified' | 'failed';
  idempotencyKey: string;
}

export interface CreateInitiatedParams {
  userId: string;
  provider: string;
  providerRef: string;
  tierId: string;
  priceSnapshotMinor: number;
  creditAllowanceSnapshot: number;
  idempotencyKey: string;
}

/**
 * All Drizzle access for `payment_event` + the `subscription_tier` lookup a
 * checkout needs (repository pattern — no naked queries in `PaymentsService`).
 */
@Injectable()
export class PaymentsRepository {
  async findTierByPublicId(publicId: string): Promise<TierForCheckout | null> {
    const [row] = await db
      .select({
        id: subscriptionTier.id,
        priceMinor: subscriptionTier.priceMinor,
        monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
      })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  /** Snapshots the chosen plan's price + allowance into a new `initiated` payment_event. */
  async createInitiated(params: CreateInitiatedParams): Promise<{ id: string; publicId: string }> {
    const [row] = await db
      .insert(paymentEvent)
      .values({
        userId: params.userId,
        provider: params.provider,
        providerRef: params.providerRef,
        planId: params.tierId,
        priceSnapshotMinor: params.priceSnapshotMinor,
        creditAllowanceSnapshot: params.creditAllowanceSnapshot,
        status: 'initiated',
        idempotencyKey: params.idempotencyKey,
      })
      .returning({ id: paymentEvent.id, publicId: paymentEvent.publicId });
    return row;
  }

  async findByProviderRef(providerRef: string): Promise<PaymentEventRow | null> {
    const [row] = await db
      .select({
        id: paymentEvent.id,
        userId: paymentEvent.userId,
        planId: paymentEvent.planId,
        providerRef: paymentEvent.providerRef,
        priceSnapshotMinor: paymentEvent.priceSnapshotMinor,
        creditAllowanceSnapshot: paymentEvent.creditAllowanceSnapshot,
        status: paymentEvent.status,
        idempotencyKey: paymentEvent.idempotencyKey,
      })
      .from(paymentEvent)
      .where(eq(paymentEvent.providerRef, providerRef))
      .limit(1);
    return row ?? null;
  }

  /** Adapter-verified failure: mark failed, touch nothing else (no ledger/tier write). */
  async markFailed(id: string): Promise<void> {
    await db.update(paymentEvent).set({ status: 'failed' }).where(eq(paymentEvent.id, id));
  }

  /** Adapter-verified success, WITHIN the caller's transaction (paired with the credit grant). */
  async markVerifiedTx(tx: Tx, id: string): Promise<void> {
    await tx.update(paymentEvent).set({ status: 'verified' }).where(eq(paymentEvent.id, id));
  }
}
