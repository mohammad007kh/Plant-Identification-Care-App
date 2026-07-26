import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when a user lacks credit for an AI action. Maps to HTTP 402; the
 * upgrade-modal payload (live plans) is attached by T-082's guard/filter.
 */
export class InsufficientCreditException extends HttpException {
  constructor(detail = 'insufficient credit') {
    super({ code: 'insufficient_credit', detail }, HttpStatus.PAYMENT_REQUIRED);
  }
}
