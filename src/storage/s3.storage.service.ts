/**
 * S3 Storage Service — Refactored
 *
 * Improvements:
 * - Retry logic with exponential backoff for transient errors
 * - Multipart upload for files >5MB
 * - Presigned URL generation for direct browser uploads
 * - Configurable endpoint (supports S3, MinIO, R2, etc.)
 * - Streaming downloads with Range request support
 * - Proper error handling with typed errors
 */

import { Injectable, Logger } from '@nestjs/common'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'
import { StorageService, StorageError } from './storage.service'

export interface StorageConfig {
  region: string
  bucket: string
  endpoint?: string // For MinIO, R2, etc.
  forcePathStyle?: boolean
  maxRetries?: number
  multipartThreshold?: number // Bytes, default 5MB
  multipartPartSize?: number // Bytes, default 5MB
}

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name)
  private readonly client: S3Client
  private readonly bucket!: string
  // endpoint stays optional in the resolved config — Required<StorageConfig>
  // would demand a string for it, but a custom endpoint is legitimately unset
  // when talking to real AWS.
  private readonly config: Omit<Required<StorageConfig>, 'endpoint'> & { endpoint?: string }

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
      bucket: config?.bucket || process.env.S3_BUCKET || '',
      endpoint: config?.endpoint || process.env.S3_ENDPOINT,
      forcePathStyle: config?.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE === 'true'),
      maxRetries: config?.maxRetries ?? 3,
      multipartThreshold: config?.multipartThreshold ?? 5 * 1024 * 1024, // 5MB
      multipartPartSize: config?.multipartPartSize ?? 5 * 1024 * 1024, // 5MB
    }

    if (!this.config.bucket) {
      throw new Error('S3_BUCKET must be configured')
    }
    this.bucket = this.config.bucket

    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      maxAttempts: this.config.maxRetries + 1, // Initial attempt + retries
    })
  }  // ───────────────────────────────────────────────────────────────────────────
  // Single-part upload (for small files)
  // ───────────────────────────────────────────────────────────────────────────

  async upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<void> {
    const body = data instanceof Buffer ? data : Buffer.from(data)

    // Auto-switch to multipart for large files
    if (body.length > this.config.multipartThreshold) {
      const readable = Readable.from([body])
      return this.uploadMultipart(key, readable, mimeType)
    }

    await this.retry(async () => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: mimeType,
        })
      )
    }, `upload ${key}`)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Multipart upload (for large files)
  // ───────────────────────────────────────────────────────────────────────────

  async uploadMultipart(
    key: string,
    data: AsyncIterable<Uint8Array>,
    mimeType: string,
    partSize?: number
  ): Promise<void> {
    const effectivePartSize = partSize || this.config.multipartPartSize
    const uploadId = await this.createMultipartUpload(key, mimeType)
    const parts: { PartNumber: number; ETag: string }[] = []

    try {
      let partNumber = 1
      for await (const chunk of data) {
        const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk)

        // Split chunk into parts if larger than partSize
        for (let offset = 0; offset < buffer.length; offset += effectivePartSize) {
          const partData = buffer.subarray(offset, Math.min(offset + effectivePartSize, buffer.length))
          const etag = await this.uploadPart(key, uploadId, partNumber, partData)
          parts.push({ PartNumber: partNumber, ETag: etag })
          partNumber++
        }
      }

      await this.completeMultipartUpload(key, uploadId, parts)
    } catch (error) {
      await this.abortMultipartUpload(key, uploadId)
      throw error
    }
  }

  private async createMultipartUpload(key: string, mimeType: string): Promise<string> {
    return this.retry(async () => {
      const response = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: mimeType,
        })
      )
      if (!response.UploadId) throw new Error('No UploadId returned')
      return response.UploadId
    }, `createMultipartUpload ${key}`)
  }

  private async uploadPart(key: string, uploadId: string, partNumber: number, data: Buffer): Promise<string> {
    return this.retry(async () => {
      const response = await this.client.send(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: data,
        })
      )
      if (!response.ETag) throw new Error('No ETag returned for part')
      return response.ETag
    }, `uploadPart ${key} part ${partNumber}`)
  }

  private async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[]
  ): Promise<void> {
    await this.retry(async () => {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      )
    }, `completeMultipartUpload ${key}`)
  }

  private async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        })
      )
    } catch (e) {
      // Best effort cleanup
      this.logger.warn('Failed to abort multipart upload', { key, uploadId, error: String(e) })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Download with Range support
  // ───────────────────────────────────────────────────────────────────────────

  async download(key: string, range?: { start: number; end?: number }): Promise<Readable> {
    return this.retry(async () => {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end ?? ''}` : undefined,
      })

      const response = await this.client.send(command)
      const body = response.Body

      if (!body) {
        throw new StorageError('Empty response body', 'NOT_FOUND', 404)
      }

      return body as Readable
    }, `download ${key}`)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Presigned URLs (for direct browser uploads/downloads)
  // ───────────────────────────────────────────────────────────────────────────

  async getPresignedUploadUrl(key: string, mimeType: string, expiresIn = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    })
    return getSignedUrl(this.client, command, { expiresIn })
  }

  async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    return getSignedUrl(this.client, command, { expiresIn })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Delete & Exists
  // ───────────────────────────────────────────────────────────────────────────

  async delete(key: string): Promise<void> {
    await this.retry(async () => {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
    }, `delete ${key}`)
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
      return true
    } catch (e) {
      if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) {
        return false
      }
      throw e
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Retry Helper
  // ───────────────────────────────────────────────────────────────────────────

  private async retry<T>(
    fn: () => Promise<T>,
    operation: string,
    attempt = 1
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      const isRetryable = this.isRetryableError(error)
      const maxAttempts = this.config.maxRetries + 1

      if (isRetryable && attempt < maxAttempts) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 10000) + Math.random() * 1000
        this.logger.warn(`Retrying ${operation} (attempt ${attempt + 1}/${maxAttempts}) after ${Math.round(delay)}ms`, {
          error: error instanceof Error ? error.message : String(error),
        })
        await new Promise(resolve => setTimeout(resolve, delay))
        return this.retry(fn, operation, attempt + 1)
      }

      this.logger.error(`Failed ${operation} after ${attempt} attempt(s)`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw this.normalizeError(error, operation)
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof S3ServiceException) {
      // Retry on 5xx, 429, and specific throttling errors
      const status = error.$metadata.httpStatusCode
      if (status && (status >= 500 || status === 429)) return true
      // Retry on specific error codes
      const code = error.name
      return ['Throttling', 'RequestTimeout', 'ConnectionError', 'NetworkingError'].includes(code)
    }
    // Network errors, timeouts
    if (error instanceof Error) {
      return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].some(code => error.message.includes(code))
    }
    return false
  }

  private normalizeError(error: unknown, operation: string): StorageError {
    if (error instanceof S3ServiceException) {
      const status = error.$metadata.httpStatusCode || 500
      return new StorageError(
        `${operation} failed: ${error.message}`,
        error.name,
        status
      )
    }
    if (error instanceof Error) {
      return new StorageError(`${operation} failed: ${error.message}`, 'UNKNOWN', 500)
    }
    return new StorageError(`${operation} failed: ${String(error)}`, 'UNKNOWN', 500)
  }
}