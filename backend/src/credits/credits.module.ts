import { Module } from '@nestjs/common';
import { CreditLedgerRepository } from './credit-ledger.repository';
import { CreditsService } from './credits.service';

@Module({
  providers: [CreditLedgerRepository, CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
