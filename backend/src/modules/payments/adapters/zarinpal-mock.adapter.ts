import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentPort,
  VerifyResult,
} from '../ports/payment.port';

interface PendingCheckout {
  amountMinor: number;
}

/**
 * In-process Zarinpal simulator (FR-018) — no real HTTP call to any payment
 * provider, ever. `initiateCheckout` mints an Authority-shaped reference;
 * `verify` answers deterministically from its OWN in-memory record of that
 * reference, so a forged/never-issued Authority always fails verification —
 * this is what makes "never trust the redirect" actually true even for the
 * mock. Test suites that need a controllable failure outcome override the
 * `PAYMENT_PORT` DI token with a custom double (see payments.e2e.spec.ts)
 * rather than mutating this class.
 */
@Injectable()
export class ZarinpalMockAdapter implements PaymentPort {
  private readonly pending = new Map<string, PendingCheckout>();

  async initiateCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const providerRef = `MOCK-AUTH-${ulid()}`;
    this.pending.set(providerRef, { amountMinor: input.amountMinor });
    return {
      redirectUrl: `https://mock-zarinpal.local/pay/${providerRef}`,
      providerRef,
    };
  }

  async verify(providerRef: string): Promise<VerifyResult> {
    const record = this.pending.get(providerRef);
    if (!record) {
      return { status: 'failed', amountMinor: 0, providerRef };
    }
    return { status: 'verified', amountMinor: record.amountMinor, providerRef };
  }
}
