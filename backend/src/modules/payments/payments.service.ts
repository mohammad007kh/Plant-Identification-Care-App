import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutResponse, PaymentVerifyResponse } from 'shared';
import { db } from '../../db/client';
import { CreditsService } from '../../credits/credits.service';
import { PAYMENT_PORT, type PaymentPort } from './ports/payment.port';
import { PaymentsRepository } from './payments.repository';

const PROVIDER_NAME = 'zarinpal_mock';

/**
 * Orchestrates the mock Zarinpal checkout/verify flow (T-081, FR-018).
 * `checkout` snapshots the chosen plan's price + credit allowance into a new
 * `payment_event(status=initiated)` and calls `PaymentPort.initiateCheckout`.
 * `verify` NEVER trusts a client-supplied `Status` query param — it always
 * re-checks server-to-server via `PaymentPort.verify`, and on a confirmed
 * success grants the snapshotted credit allowance + sets the user's tier in
 * ONE DB transaction, idempotent by the payment_event's own idempotency key.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repo: PaymentsRepository,
    @Inject(PAYMENT_PORT) private readonly gateway: PaymentPort,
    private readonly credits: CreditsService,
  ) {}

  async checkout(userId: string, planPublicId: string): Promise<CheckoutResponse> {
    const tier = await this.repo.findTierByPublicId(planPublicId);
    if (!tier) throw new NotFoundException('plan not found');

    const { redirectUrl, providerRef } = await this.gateway.initiateCheckout({
      userId,
      amountMinor: tier.priceMinor,
    });

    await this.repo.createInitiated({
      userId,
      provider: PROVIDER_NAME,
      providerRef,
      tierId: tier.id,
      priceSnapshotMinor: tier.priceMinor,
      creditAllowanceSnapshot: tier.monthlyCreditAllowance,
      // Derived from provider_ref (Station 09 §9.8.5) — a replayed verify call
      // for the same Authority can never double-grant.
      idempotencyKey: `payment:${providerRef}`,
    });

    return { redirectUrl };
  }

  async verify(providerRef: string): Promise<PaymentVerifyResponse> {
    const event = await this.repo.findByProviderRef(providerRef);
    if (!event) {
      throw new BadRequestException({
        code: 'unknown_authority',
        message: 'unrecognized Authority',
      });
    }

    // Idempotent: an already-resolved event returns its stored outcome without
    // re-invoking the adapter or the grant path (no double grant on replay).
    if (event.status !== 'initiated') {
      return { status: event.status === 'verified' ? 'verified' : 'failed' };
    }

    // The ONLY source of truth for success/failure — never the caller's Status
    // query param. `providerRef` here is used purely to look up which
    // payment_event to resolve.
    const result = await this.gateway.verify(providerRef);

    if (result.status !== 'verified') {
      await this.repo.markFailed(event.id);
      return { status: 'failed' };
    }

    if (!event.planId) {
      // Defensive: checkout always snapshots a plan id; this should never happen.
      throw new BadRequestException({
        code: 'invalid_payment_event',
        message: 'payment event has no associated plan',
      });
    }
    const tierId = event.planId;

    // Single DB transaction: mark verified + grant credit + set tier together
    // (data-model.md critical invariant #5).
    await db.transaction(async (tx) => {
      await this.repo.markVerifiedTx(tx, event.id);
      await this.credits.grantAndSetTierTx(tx, event.userId, {
        amount: event.creditAllowanceSnapshot,
        tierId,
        idempotencyKey: event.idempotencyKey,
      });
    });

    return { status: 'verified' };
  }
}
