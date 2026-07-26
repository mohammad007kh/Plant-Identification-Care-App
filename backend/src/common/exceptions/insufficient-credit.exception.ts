import { HttpException, HttpStatus } from '@nestjs/common';
import type { Plan } from 'shared';

/**
 * Thrown by `CreditCheckGuard` (T-082, Station 10 §10.6.5) when the
 * authenticated caller lacks sufficient credit for a metered AI action. Maps
 * to `402 application/problem+json`; embeds the SAME `Plan[]` payload
 * `GET /v1/subscriptions/plans` returns (via `ProblemDetailsFilter`'s
 * extension-member pass-through) so the frontend upgrade modal (T-083) can
 * render immediately, with no second round trip.
 *
 * Distinct from `credits/insufficient-credit.exception.ts`, which is the
 * ledger's own last-resort guard against a debit racing past zero balance
 * (no plans payload — that lower layer has no access to `SubscriptionsService`
 * and should never normally fire once this guard runs first).
 */
export class InsufficientCreditException extends HttpException {
  constructor(plans: Plan[], detail = 'insufficient credit for this action') {
    super({ code: 'insufficient_credit', detail, plans }, HttpStatus.PAYMENT_REQUIRED);
  }
}
