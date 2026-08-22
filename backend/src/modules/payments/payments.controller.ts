import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CheckoutResponse, PaymentVerifyResponse } from 'shared';
import { checkoutRequestSchema } from 'shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { PaymentsService } from './payments.service';

/**
 * `POST /v1/payments/checkout` (bearerAuth) and `GET /v1/payments/verify`
 * (unauthenticated — this is the Zarinpal callback the browser is redirected
 * to, per contract `security: []`). Not registered in app.module here — T-097
 * wires it.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  checkout(@CurrentUserId() userId: string, @Body() body: unknown): Promise<CheckoutResponse> {
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'validation_error',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    return this.payments.checkout(userId, parsed.data.planId);
  }

  @Public()
  @Get('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Query('Authority') authority?: string): Promise<PaymentVerifyResponse> {
    // `Status` is intentionally NOT read here — verification never trusts a
    // client-supplied redirect query param (Station 09 §9.7.1); only
    // PaymentsService.verify's server-to-server adapter call decides the outcome.
    if (!authority) {
      throw new BadRequestException({
        code: 'missing_authority',
        message: 'Authority query param is required',
      });
    }
    return this.payments.verify(authority);
  }
}
