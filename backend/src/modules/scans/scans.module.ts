import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/app-config.module';
import { UploadsModule } from '../../common/uploads/uploads.module';
import { AiGatewayModule } from '../../ai-gateway/ai-gateway.module';
import { CreditsModule } from '../../credits/credits.module';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScansRepository } from './scans.repository';
import { IdentifyService } from './identify.service';
import { IdentifyQueue } from './identify.queue';
import { IdentifyWorker } from './identify.worker';

/**
 * US1 scan/identify feature module: HTTP submission + polling, async identify
 * worker, and the credit reserve/settle wiring. NOT imported by app.module here
 * — T-037 registers it once the rest of US1 (T-021, T-022) exists.
 */
@Module({
  imports: [AppConfigModule, UploadsModule, AiGatewayModule, CreditsModule],
  controllers: [ScansController],
  providers: [ScansService, ScansRepository, IdentifyService, IdentifyQueue, IdentifyWorker],
  exports: [ScansService, IdentifyService],
})
export class ScansModule {}
