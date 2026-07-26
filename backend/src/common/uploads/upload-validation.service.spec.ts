import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { UploadValidationService } from './upload-validation.service';
import type { AppConfigService } from '../config/app-config.service';

// Stub AppConfigService: no DB needed — deterministic allowlist.
function makeService(
  allowed: string[] = ['image/jpeg', 'image/png', 'image/webp'],
): UploadValidationService {
  const stub = { getAllowedPhotoFileTypes: async () => allowed } as unknown as AppConfigService;
  return new UploadValidationService(stub);
}

let pngBuf: Buffer;
let jpegBuf: Buffer;
let webpBuf: Buffer;

beforeAll(async () => {
  const base = sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 10, g: 130, b: 40 } },
  });
  pngBuf = await base.clone().png().toBuffer();
  jpegBuf = await base.clone().jpeg().toBuffer();
  webpBuf = await base.clone().webp().toBuffer();
});

describe('UploadValidationService (T-014, FR-004)', () => {
  it('accepts and normalizes a valid PNG (magic-byte detected, not extension)', async () => {
    const out = await makeService().validateAndNormalize(pngBuf);
    expect(out.contentType).toBe('image/png');
    expect(out.width).toBe(24);
    expect(out.height).toBe(24);
    expect(out.bytes).toBeGreaterThan(0);
  });

  it('accepts valid JPEG and WebP', async () => {
    expect((await makeService().validateAndNormalize(jpegBuf)).contentType).toBe('image/jpeg');
    expect((await makeService().validateAndNormalize(webpBuf)).contentType).toBe('image/webp');
  });

  it('rejects a non-image (garbage bytes) — no decode', async () => {
    await expect(
      makeService().validateAndNormalize(Buffer.from('this is not an image')),
    ).rejects.toThrow();
  });

  it('rejects an SVG even though sharp can parse it', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    );
    await expect(makeService().validateAndNormalize(svg)).rejects.toThrow();
  });

  it('rejects an oversized upload before decoding', async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024, 1);
    await expect(makeService().validateAndNormalize(huge)).rejects.toThrow();
  });

  it('rejects a real image whose type is not in the admin allowlist', async () => {
    const onlyPng = makeService(['image/png']);
    await expect(onlyPng.validateAndNormalize(jpegBuf)).rejects.toThrow();
  });

  it('rejects an empty buffer', async () => {
    await expect(makeService().validateAndNormalize(Buffer.alloc(0))).rejects.toThrow();
  });
});
