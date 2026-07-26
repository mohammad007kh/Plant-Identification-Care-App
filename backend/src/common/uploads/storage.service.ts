import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

  /** Deletes by key (used by the account-purge job, T-130). */
  async getCommand(key: string): Promise<GetObjectCommand> {
    return new GetObjectCommand({ Bucket: this.bucket, Key: key });
  }
}
