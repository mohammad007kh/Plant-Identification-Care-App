import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ScanJob } from 'shared';
import { OptionalUserId } from '../../common/auth/optional-user';
import { UploadValidationPipe } from '../../common/uploads/upload.pipe';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';
import { ScansService } from './scans.service';

/**
 * `POST /v1/scans` (guest-allowed multipart submission) and `GET /v1/scans/:id`
 * (poll status/result). File type/size validation is delegated to T-014's
 * UploadValidationPipe; the 70% confidence gate is enforced later in the worker.
 * Not registered in app.module yet — wired by T-037 with the rest of US1.
 */
@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('photo'))
  submit(
    @UploadedFile(UploadValidationPipe) image: NormalizedImage,
    @OptionalUserId() userId: string | null,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ScanJob> {
    return this.scans.submitIdentify({ image, userId, idempotencyKey });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ScanJob> {
    return this.scans.getByPublicId(id);
  }
}
