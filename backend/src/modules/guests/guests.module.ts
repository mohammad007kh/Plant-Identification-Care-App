import { Module } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { GuestSessionRepository } from './guest-session.repository';
import { IpScanBackstopService } from './ip-scan-backstop.service';
import { GuestMergeService } from './guest-merge.service';

/**
 * Guest identity + scan-limit enforcement (FR-006) + guest→account merge
 * (FR-008, T-041). Consumed by ScansModule's controller and AuthModule's
 * registration hook. NOT imported by app.module here — wired in T-037/T-057.
 */
@Module({
  providers: [GuestsService, GuestSessionRepository, IpScanBackstopService, GuestMergeService],
  exports: [GuestsService, GuestMergeService],
})
export class GuestsModule {}
