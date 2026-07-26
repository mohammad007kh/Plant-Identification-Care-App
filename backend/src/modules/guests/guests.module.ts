import { Module } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { GuestSessionRepository } from './guest-session.repository';
import { IpScanBackstopService } from './ip-scan-backstop.service';

/**
 * Guest identity + scan-limit enforcement (FR-006). Consumed by ScansModule's
 * controller. NOT imported by app.module here — wired via ScansModule; the full
 * app registration happens in T-037.
 */
@Module({
  providers: [GuestsService, GuestSessionRepository, IpScanBackstopService],
  exports: [GuestsService],
})
export class GuestsModule {}
