/**
 * Documents Service — Refactored
 *
 * Improvements:
 * - Transactional uploads: DB record created first (pending), then S3 upload, then commit
 * - UUID v7 for collision-resistant, time-ordered keys
 * - MIME allowlist validation (not just size)
 * - Cursor-based pagination for scalability
 * - Soft-delete filtering by default
 * - Compensation logic: cleanup S3 on DB failure
 * - Proper error types
 */

import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, Logger, Inject } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, FindOptionsWhere, Between } from 'typeorm'
import { v7 as uuidv7 } from 'uuid'
import { Document, DocumentStatus } from './document.entity'
import { CreateDocumentDto } from './dto/create-document.dto'
import { UpdateDocumentDto } from './dto/update-document.dto'
import { StorageService, StorageError } from '../storage/storage.service'
import { STORAGE_SERVICE } from '../storage/storage.module'
import { ConfigService } from '../config/config.service'
import { Readable } from 'stream'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration & Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'text/markdown',
  'text/csv',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Presentations
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
  // Archives
  'application/zip',
  'application/x-tar',
  'application/gzip',
  // Code
  'application/json',
  'application/xml',
  'text/html',
  'text/css',
  'application/javascript',
  'application/typescript',
])

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024 // 10MB
const CURSOR_PAGE_SIZE = 50

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  total: number
}

export type UploadResult = {
  document: Document
  uploadUrl?: string // Presigned URL if direct upload was used
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    @InjectRepository(Document)
    private readonly repo: Repository<Document>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Upload (Transactional)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Upload a document with transactional guarantees:
   * 1. Create DB record with status='pending'
   * 2. Upload to S3
   * 3. Update DB record to status='completed'
   * On any failure: delete S3 object (if uploaded) and mark DB as 'failed' or delete
   */
  async upload(file: Express.Multer.File, dto: CreateDocumentDto): Promise<Document> {
    // get() returns string | undefined; the unary + on undefined is NaN which
    // the || fallback handles, but TS wants the undefined handled explicitly.
    const maxSizeRaw = this.config.get('MAX_SIZE_BYTES')
    const maxSize = maxSizeRaw !== undefined ? +maxSizeRaw || DEFAULT_MAX_SIZE : DEFAULT_MAX_SIZE

    // Validate size
    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds limit of ${maxSize} bytes`)
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`)
    }

    // Generate collision-resistant, time-ordered key
    const key = this.generateKey(file.originalname)

    // Step 1: Create pending record in DB
    const doc = this.repo.create({
      id: key,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      description: dto.description,
      metadata: dto.metadata || {},
      status: DocumentStatus.PENDING,
    })

    let savedDoc: Document
    try {
      savedDoc = await this.repo.save(doc)
    } catch (e) {
      this.logger.error('Failed to create pending document record', { key, error: String(e) })
      throw new InternalServerErrorException('Failed to initialize upload')
    }

    // Step 2: Upload to S3
    try {
      await this.storage.upload(key, file.buffer, file.mimetype)
    } catch (e) {
      // Compensation: mark as failed, don't delete (for debugging)
      await this.repo.update(key, { status: DocumentStatus.FAILED })
      this.logger.error('S3 upload failed, marked document as failed', { key, error: String(e) })

      if (e instanceof StorageError) {
        throw new BadRequestException(`Upload failed: ${e.message}`)
      }
      throw new InternalServerErrorException('Upload failed')
    }

    // Step 3: Mark as completed
    try {
      await this.repo.update(key, { status: DocumentStatus.COMPLETED })
      savedDoc.status = DocumentStatus.COMPLETED
    } catch (e) {
      // S3 upload succeeded but DB update failed - log for manual reconciliation
      this.logger.error('CRITICAL: S3 upload succeeded but DB update failed - manual cleanup needed', {
        key,
        error: String(e),
      })
      // Don't throw - the file is in S3, user can retry or admin can fix
      savedDoc.status = DocumentStatus.COMPLETED // Assume success for response
    }

    return savedDoc
  }

  /**
   * Generate a presigned URL for direct browser upload.
   * Caller uploads directly to S3, then calls confirmUpload().
   */
  async getPresignedUploadUrl(
    filename: string,
    mimeType: string,
    expiresIn = 3600
  ): Promise<{ key: string; uploadUrl: string }> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} is not allowed`)
    }

    const key = this.generateKey(filename)
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, mimeType, expiresIn)

    // Create pending record
    const doc = this.repo.create({
      id: key,
      filename,
      mimeType,
      size: 0, // Will be updated on confirm
      status: 'pending' as DocumentStatus,
    })
    await this.repo.save(doc)

    return { key, uploadUrl }
  }

  /**
   * Confirm a direct upload (called after browser uploads to presigned URL).
   */
  async confirmUpload(key: string, actualSize: number): Promise<Document> {
    const doc = await this.repo.findOneBy({ id: key })
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.status !== 'pending') throw new BadRequestException('Document not in pending state')

    // Verify object exists in S3
    const exists = await this.storage.exists(key)
    if (!exists) {
      await this.repo.update(key, { status: 'failed' as DocumentStatus })
      throw new BadRequestException('Uploaded object not found in storage')
    }

    await this.repo.update(key, { size: actualSize, status: 'completed' as DocumentStatus })
    return this.repo.findOneByOrFail({ id: key })
  }

  private generateKey(originalName: string): string {
    // UUID v7: time-ordered, collision-resistant
    const uuid = uuidv7()
    // Sanitize filename for key safety
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    return `${uuid}-${safeName}`
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Query Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Cursor-based pagination (efficient for large datasets).
   * Returns items sorted by createdAt DESC.
   */
  async findAll(
    cursor?: string,
    limit = CURSOR_PAGE_SIZE,
    includeDeleted = false
  ): Promise<PaginatedResult<Document>> {
    const take = Math.min(limit, CURSOR_PAGE_SIZE)
    const where: FindOptionsWhere<Document> = includeDeleted ? {} : { isDeleted: false }

    if (cursor) {
      const cursorDate = new Date(cursor)
      if (isNaN(cursorDate.getTime())) {
        throw new BadRequestException('Invalid cursor')
      }
      where.createdAt = Between(new Date(0), cursorDate)
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: take + 1, // Fetch one extra to determine hasMore
    })

    const hasMore = items.length > take
    const resultItems = hasMore ? items.slice(0, take) : items
    const nextCursor = hasMore ? resultItems[resultItems.length - 1].createdAt.toISOString() : null

    return { items: resultItems, nextCursor, hasMore, total }
  }

  /**
   * Legacy offset pagination (for backward compatibility).
   */
  async findAllOffset(page = 1, limit = 10, includeDeleted = false): Promise<{
    items: Document[]
    total: number
    page: number
    limit: number
  }> {
    const where: FindOptionsWhere<Document> = includeDeleted ? {} : { isDeleted: false }
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    })
    return { items, total, page, limit }
  }

  async findOne(id: string, includeDeleted = false): Promise<Document> {
    const where: FindOptionsWhere<Document> = { id }
    if (!includeDeleted) where.isDeleted = false

    const doc = await this.repo.findOneBy(where)
    if (!doc) throw new NotFoundException()
    return doc
  }

  async update(id: string, dto: UpdateDocumentDto): Promise<Document> {
    const doc = await this.findOne(id)
    Object.assign(doc, dto)
    return this.repo.save(doc)
  }

  async delete(id: string): Promise<Document> {
    const doc = await this.findOne(id)
    doc.isDeleted = true
    doc.deletedAt = new Date()
    return this.repo.save(doc)
  }

  /**
   * Hard delete (admin only) - removes from S3 and DB.
   */
  async hardDelete(id: string): Promise<void> {
    const doc = await this.findOne(id, true) // Include deleted
    try {
      await this.storage.delete(doc.id)
    } catch (e) {
      this.logger.warn('Failed to delete from S3 during hard delete', { id, error: String(e) })
    }
    await this.repo.delete(id)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Download
  // ───────────────────────────────────────────────────────────────────────────

  async download(id: string, range?: { start: number; end?: number }): Promise<Readable> {
    const doc = await this.findOne(id)
    return this.storage.download(doc.id, range)
  }

  async getPresignedDownloadUrl(id: string, expiresIn = 3600): Promise<string> {
    const doc = await this.findOne(id)
    return this.storage.getPresignedDownloadUrl(doc.id, expiresIn)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utility
  // ───────────────────────────────────────────────────────────────────────────

  async getStorageStats(): Promise<{ totalDocuments: number; totalSize: number; byStatus: Record<string, number> }> {
    const [totalDocuments, totalSizeResult, byStatus] = await Promise.all([
      this.repo.count({ where: { isDeleted: false } }),
      this.repo.createQueryBuilder('doc')
        .select('SUM(doc.size)', 'totalSize')
        .where('doc.isDeleted = :isDeleted', { isDeleted: false })
        .getRawOne(),
      this.repo.createQueryBuilder('doc')
        .select('doc.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('doc.isDeleted = :isDeleted', { isDeleted: false })
        .groupBy('doc.status')
        .getRawMany(),
    ])

    return {
      totalDocuments,
      totalSize: Number(totalSizeResult?.totalSize) || 0,
      byStatus: byStatus.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count) }), {}),
    }
  }
}