import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { AppConfigService } from '../config/app-config.service';

export interface NormalizedImage {
  normalizedBuffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
}

/** sharp format id → canonical MIME. SVG is intentionally absent (excluded below). */
const FORMAT_TO_MIME: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);
const MAX_PIXELS = Number(process.env.MAX_UPLOAD_PIXELS ?? 24_000_000);

/**
 * Validates and normalizes an uploaded image (Station 13). It NEVER trusts the
 * file extension or client Content-Type: `sharp` decodes the actual bytes to
 * determine the real format, the format is checked against the admin-configured
 * allowlist (live, from AppConfigService), SVG is rejected, size + decoded-pixel
 * caps guard against bombs, and the image is re-encoded (stripping EXIF and any
 * trailing polyglot bytes) before it is ever stored.
 *
 * Pure/stateless: performs NO scan-count or credit mutation. Callers run this
 * FIRST and only debit/increment on success (FR-004: reject without cost).
 */
@Injectable()
export class UploadValidationService {
  constructor(private readonly appConfig: AppConfigService) {}

  async validateAndNormalize(buffer: Buffer): Promise<NormalizedImage> {
    if (!buffer || buffer.length === 0) {
      throw new UnsupportedMediaTypeException('upload.empty');
    }
    if (buffer.length > MAX_BYTES) {
      throw new PayloadTooLargeException('upload.tooLarge');
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new UnsupportedMediaTypeException('upload.notAnImage');
    }

    const format = metadata.format ?? '';
    if (format === 'svg') {
      throw new UnsupportedMediaTypeException('upload.svgNotAllowed');
    }

    const mime = FORMAT_TO_MIME[format];
    if (!mime) {
      throw new UnsupportedMediaTypeException('upload.unsupportedFormat');
    }

    const allowed = await this.appConfig.getAllowedPhotoFileTypes();
    if (!allowed.includes(mime)) {
      throw new UnsupportedMediaTypeException('upload.typeNotAllowed');
    }

    const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
    if (pixels === 0 || pixels > MAX_PIXELS) {
      throw new PayloadTooLargeException('upload.dimensionsTooLarge');
    }

    // Re-encode to the same format: strips EXIF/metadata and any bytes past the
    // image's logical end (polyglot defense). Auto-orient via rotate().
    // `metadata()` above only parses the header — the full pixel decode happens
    // here, so a file with a valid header but corrupt/undecodable pixel data
    // (e.g. libspng read errors) surfaces at this step. Treat that as an
    // unsupported upload (415), never an unhandled 500.
    let normalizedBuffer: Buffer;
    let outMeta: sharp.Metadata;
    try {
      const pipeline = sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate();
      normalizedBuffer = await (
        format === 'png'
          ? pipeline.png()
          : format === 'webp'
            ? pipeline.webp()
            : pipeline.jpeg({ quality: 90 })
      ).toBuffer();
      outMeta = await sharp(normalizedBuffer).metadata();
    } catch {
      throw new UnsupportedMediaTypeException('upload.notAnImage');
    }
    return {
      normalizedBuffer,
      contentType: mime,
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
      bytes: normalizedBuffer.length,
    };
  }
}
