import { Controller, Get, Post, Put, Delete, Param, Body, UploadedFile, UseInterceptors, Query, UseGuards, Req, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { Request, Response } from 'express';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() dto: CreateDocumentDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.documentsService.upload(file, dto);
    res.setHeader('Location', `/documents/${result.id}`);
    return result;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.documentsService.findAll({ page: +page, limit: +limit });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string) {
    return this.documentsService.delete(id);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  async download(@Param('id') id: string, @Res() res: Response) {
    const stream = await this.documentsService.download(id);
    res.setHeader('Content-Disposition', `attachment; filename="${id}"`);
    stream.pipe(res);
  }
}
