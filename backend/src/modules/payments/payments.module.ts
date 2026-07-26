import { Module } from '@nestjs/common';
import { CreditsModule } from '../../credits/credits.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { PAYMENT_PORT } from './ports/payment.port';
import { ZarinpalMockAdapter } from './adapters/zarinpal-mock.adapter';

/**
 * Payments module (T-081, mock Zarinpal). `PAYMENT_PORT` is bound to
 * `ZarinpalMockAdapter` here — swapping to a real `zarinpal_live`/`stripe`
 * adapter later is a one-line change to this binding, never a
 * `PaymentsService` change. Not imported by app.module here — T-097 wires it.
 */
@Module({
  imports: [AuthModule, CreditsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    ZarinpalMockAdapter,
    { provide: PAYMENT_PORT, useExisting: ZarinpalMockAdapter },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
