/**
 * Provider-agnostic payment gateway boundary (T-081, port/adapter pattern).
 * `PaymentsService` depends only on this interface (via the `PAYMENT_PORT` DI
 * token), never on a concrete adapter — a real `zarinpal_live` or `stripe`
 * adapter can be substituted later without touching `PaymentsService`. No
 * Zarinpal-specific vocabulary (Authority/Status/RefID) leaks into this
 * interface; that stays inside `ZarinpalMockAdapter`.
 */
export interface CheckoutInput {
  userId: string;
  amountMinor: number;
}

export interface CheckoutResult {
  redirectUrl: string;
  /** Provider-issued reference for this checkout attempt (Zarinpal: Authority). */
  providerRef: string;
}

export interface VerifyResult {
  status: 'verified' | 'failed';
  amountMinor: number;
  providerRef: string;
}

export interface PaymentPort {
  initiateCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /**
   * Server-to-server re-verification of a checkout attempt by its
   * `providerRef`. This — never a client-supplied redirect query param — is
   * the ONLY source of truth for whether a payment succeeded.
   */
  verify(providerRef: string): Promise<VerifyResult>;
}

/** DI token for `PaymentPort` — bind a concrete adapter to this in each module. */
export const PAYMENT_PORT = Symbol('PAYMENT_PORT');
