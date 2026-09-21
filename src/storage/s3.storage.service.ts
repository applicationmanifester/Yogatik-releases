import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.service';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = new S3Client({ region: process.env.AWS_REGION });
    this.bucket = process.env.S3_BUCKET;
  }

  async upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }),
    );
  }

  async download(key: string): Promise<Readable> {
    const cmd = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return cmd.Body as Readable;
  }
}
