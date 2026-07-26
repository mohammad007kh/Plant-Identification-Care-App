import { Injectable, PipeTransform } from '@nestjs/common';
import { UploadValidationService, type NormalizedImage } from './upload-validation.service';

/**
 * Thin NestJS pipe wrapping UploadValidationService for multipart handlers.
 * Usage: `@UploadedFile(UploadValidationPipe) image: NormalizedImage`.
 * Accepts a Multer-style file ({ buffer }) or a raw Buffer.
 */
@Injectable()
export class UploadValidationPipe implements PipeTransform {
  constructor(private readonly validator: UploadValidationService) {}

  async transform(file: { buffer: Buffer } | Buffer): Promise<NormalizedImage> {
    const buffer = Buffer.isBuffer(file) ? file : file?.buffer;
    return this.validator.validateAndNormalize(buffer);
  }
}
