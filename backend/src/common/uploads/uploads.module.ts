import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { UploadValidationService } from './upload-validation.service';
import { UploadValidationPipe } from './upload.pipe';
import { StorageService } from './storage.service';

/**
 * Shared uploads module: image validation/normalization + S3 storage.
 * Consumed by ScansModule (T-020) and PlantsModule (T-060).
 */
@Module({
  imports: [AppConfigModule],
  providers: [UploadValidationService, UploadValidationPipe, StorageService],
  exports: [UploadValidationService, UploadValidationPipe, StorageService],
})
export class UploadsModule {}
