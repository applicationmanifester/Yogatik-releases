/**
 * Documents Controller — Refactored
 *
 * Improvements:
 * - Proper Content-Disposition with original filename
 * - Range request support for resumable downloads
 * - ETags for caching
 * - Proper HTTP status codes
 * - Streaming responses to avoid memory pressure
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Query,
  UseGuards,
  Req,
  Res,
  Header,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { Response, Request } from 'express'
import { Readable } from 'stream'
import { JwtAuthGuard } from '../auth/auth.guard'
import { DocumentsService, UploadResult, PaginatedResult } from './documents.service'
import { CreateDocumentDto } from './dto/create-document.dto'
import { UpdateDocumentDto } from './dto/update-document.dto'

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Upload (multipart/form-data)
  // ───────────────────────────────────────────────────────────────────────────

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        description: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.documentsService.upload(file, dto)
    res.setHeader('Location', `/documents/${result.id}`)
    res.status(HttpStatus.CREATED)
    return result
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Presigned Upload URL (for direct browser uploads)
  // ───────────────────────────────────────────────────────────────────────────

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get a presigned URL for direct browser upload' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        mimeType: { type: 'string' },
      },
      required: ['filename', 'mimeType'],
    },
  })
  @ApiResponse({ status: 200, description: 'Presigned URL generated' })
  async getPresignedUploadUrl(
    @Body() body: { filename: string; mimeType: string },
  ): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
    const { key, uploadUrl } = await this.documentsService.getPresignedUploadUrl(
      body.filename,
      body.mimeType,
    )
    return { key, uploadUrl, expiresIn: 3600 }
  }

  @Post(':id/confirm-upload')
  @ApiOperation({ summary: 'Confirm a direct upload completed' })
  @ApiParam({ name: 'id', description: 'Document key from presigned URL response' })
  @ApiBody({ schema: { type: 'object', properties: { size: { type: 'number' } }, required: ['size'] } })
  @ApiResponse({ status: 200, description: 'Upload confirmed' })
  async confirmUpload(
    @Param('id') id: string,
    @Body() body: { size: number },
  ) {
    return this.documentsService.confirmUpload(id, body.size)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // List (Cursor-based pagination)
  // ───────────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List documents (cursor-based pagination)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'ISO timestamp cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50, description: 'Max items per page (default 50, max 100)' })
  @ApiResponse({ status: 200, description: 'Paginated document list' })
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResult<any>> {
    return this.documentsService.findAll(cursor, limit)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // List (Legacy offset pagination - deprecated but supported)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('legacy')
  @ApiOperation({ summary: 'List documents (offset pagination - legacy)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated document list (legacy format)' })
  async findAllLegacy(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.documentsService.findAllOffset(page, limit)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Get Single Document
  // ───────────────────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document metadata' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Update Document Metadata
  // ───────────────────────────────────────────────────────────────────────────

  @Put(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiResponse({ status: 200, description: 'Document updated' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Soft Delete
  // ───────────────────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document soft deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async delete(@Param('id') id: string) {
    return this.documentsService.delete(id)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Download with Range Support
  // ───────────────────────────────────────────────────────────────────────────

  @Get(':id/download')
  @ApiOperation({ summary: 'Download document (supports Range requests)' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'File stream' })
  @ApiResponse({ status: 206, description: 'Partial content (Range request)' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  async download(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const doc = await this.documentsService.findOne(id)

    // Parse Range header
    const rangeHeader = req.headers.range
    let range: { start: number; end?: number } | undefined
    let statusCode = HttpStatus.OK

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : undefined

        if (start >= doc.size || (end !== undefined && end >= doc.size)) {
          res.setHeader('Content-Range', `bytes */${doc.size}`)
          // @nestjs/common v10 names this constant after Express:
          // REQUESTED_RANGE_NOT_SATISFIABLE (416).
          res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
          return new StreamableFile(Readable.from([]))
        }

        range = { start, end }
        statusCode = HttpStatus.PARTIAL_CONTENT
      }
    }

    const stream = await this.documentsService.download(id, range)

    // Set headers
    res.setHeader('Content-Type', doc.mimeType)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.filename)}"`
    )
    res.setHeader('Content-Length', range ? (range.end ? range.end - range.start + 1 : doc.size - range.start) : doc.size)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('ETag', `"${doc.id}"`)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.status(statusCode)

    if (range) {
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end ?? doc.size - 1}/${doc.size}`)
    }

    return new StreamableFile(stream)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Presigned Download URL
  // ───────────────────────────────────────────────────────────────────────────

  @Get(':id/presigned-download')
  @ApiOperation({ summary: 'Get a presigned URL for direct download' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number, example: 3600 })
  @ApiResponse({ status: 200, description: 'Presigned download URL' })
  async getPresignedDownloadUrl(
    @Param('id') id: string,
    @Query('expiresIn') expiresIn?: number,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const downloadUrl = await this.documentsService.getPresignedDownloadUrl(id, expiresIn)
    return { downloadUrl, expiresIn: expiresIn || 3600 }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Admin: Storage Stats
  // ───────────────────────────────────────────────────────────────────────────

  @Get('admin/stats')
  @ApiOperation({ summary: 'Get storage statistics (admin)' })
  @ApiResponse({ status: 200, description: 'Storage statistics' })
  async getStats() {
    return this.documentsService.getStorageStats()
  }
}