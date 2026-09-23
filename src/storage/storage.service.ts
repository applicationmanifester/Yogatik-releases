import { Readable } from 'stream';

/**
 * Storage-level error, defined here (next to the interface it belongs to) so
 * consumers can catch it without depending on the S3 implementation.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export interface StorageService {
  upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<void>;
  uploadMultipart(key: string, data: AsyncIterable<Uint8Array>, mimeType: string, partSize?: number): Promise<void>;
  download(key: string, range?: { start: number; end?: number }): Promise<Readable>;
  getPresignedUploadUrl(key: string, mimeType: string, expiresIn?: number): Promise<string>;
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
