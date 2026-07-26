import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { ScanJob } from 'shared';
import { OptionalUserId } from '../../common/auth/optional-user';
import { UploadValidationPipe } from '../../common/uploads/upload.pipe';
import type { NormalizedImage } from '../../common/uploads/upload-validation.service';
import { GuestsService } from '../guests/guests.service';
import { ScansService } from './scans.service';

/**
 * `POST /v1/scans` (guest-allowed multipart submission) and `GET /v1/scans/:id`
 * (poll status/result). File type/size validation is delegated to T-014's
 * UploadValidationPipe; the 70% confidence gate is enforced later in the worker.
 * Not registered in app.module yet — wired by T-037 with the rest of US1.
 */
@Controller('scans')
export class ScansController {
  constructor(
    private readonly scans: ScansService,
    private readonly guests: GuestsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('photo'))
  async submit(
    @UploadedFile(UploadValidationPipe) image: NormalizedImage,
    @OptionalUserId() userId: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ScanJob> {
    if (userId) {
      return this.scans.submitIdentify({ image, userId, idempotencyKey });
    }
    // Guest: resolve/create the httpOnly session, then atomically reserve one of
    // the 2 free slots (throws 403 at the cap) BEFORE performing the scan.
    const guestSessionId = await this.guests.resolveOrCreateGuestSession(req, res);
    await this.guests.reserveScan(guestSessionId);
    return this.scans.submitIdentify({ image, userId: null, guestSessionId, idempotencyKey });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ScanJob> {
    return this.scans.getByPublicId(id);
  }
}
