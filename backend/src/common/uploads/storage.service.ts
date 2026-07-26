import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * S3-compatible object storage (MinIO in dev, ArvanCloud in prod). Stores blobs
 * under randomized keys with a locked-down Content-Type + attachment disposition
 * so a mislabeled file can never be interpreted as HTML/script by a browser.
 */
@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? process.env.S3_SECRET_KEY ?? 'minioadmin',
    },
  });

  private readonly bucket = process.env.MINIO_BUCKET ?? process.env.S3_BUCKET ?? 'plant-photos';

  // Secret for `getSignedUrl`'s HMAC. Falls back to the access-token secret
  // (already required app-wide) rather than a bespoke env var, since no
  // dedicated photo-serving route exists yet to consume it (see note below).
  private readonly signingSecret =
    process.env.PHOTO_SIGNING_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-photo-signing-secret';

  /** Stores the buffer and returns its randomized storage key. */
  async put(buffer: Buffer, contentType: string): Promise<string> {
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: 'attachment',
      }),
    );
    return key;
  }

  /** Returns a raw get command for a key (advanced/streaming callers). */
  async getCommand(key: string): Promise<GetObjectCommand> {
    return new GetObjectCommand({ Bucket: this.bucket, Key: key });
  }

  /**
   * Deletes the object at `key` (used by the account-purge job, T-130). S3
   * `DeleteObject` is idempotent by design — deleting an already-missing key is
   * not an error — which keeps the purge job itself safely re-runnable.
   */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Fetches a stored blob's full bytes (used by the async identify worker, T-020). */
  async getBytes(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body as unknown as AsyncIterable<Uint8Array> | undefined;
    if (!body) throw new Error(`storage object not found: ${key}`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  /**
   * Builds a time-limited signed URL for a stored photo (used by the admin
   * misidentification-report review surface, T-141/FR-025). This is an
   * app-level HMAC signature over `key:expiresAt` — NOT an S3 presigned URL:
   * `@aws-sdk/s3-request-presigner` is not a project dependency, and adding
   * one is out of scope for the task that introduced this method. The result
   * is a relative path (`/v1/photos/:key`) plus `expires`/`signature` query
   * params; a future photo-serving route (verifying the same HMAC before
   * streaming `getBytes`) is what actually resolves it — not built yet.
   */
  getSignedUrl(key: string, ttlSeconds = 900): string {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const signature = createHmac('sha256', this.signingSecret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
    return `/v1/photos/${encodeURIComponent(key)}?expires=${expiresAt}&signature=${signature}`;
  }
}
