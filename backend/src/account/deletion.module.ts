import { Module } from '@nestjs/common';
import { UploadsModule } from '../common/uploads/uploads.module';
import { AuthModule } from '../modules/auth/auth.module';
import { DeletionController } from './deletion.controller';
import { DeletionQueue } from './deletion.queue';
import { DeletionRepository } from './deletion.repository';
import { DeletionService } from './deletion.service';
import { PurgeWorker } from './purge.worker';

/**
 * US8 account-deletion feature module (T-130): request/cancel/status
 * endpoints, the 7-day-delayed purge job, and complete data + storage removal.
 * Imports AuthModule for JwtAuthGuard/CurrentUserId (every route is
 * user-scoped) and UploadsModule for StorageService (object deletion). NOT
 * imported by app.module here — T-137 registers it.
 */
@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [DeletionController],
  providers: [DeletionService, DeletionRepository, DeletionQueue, PurgeWorker],
  exports: [DeletionService, DeletionRepository, DeletionQueue],
})
export class DeletionModule {}
