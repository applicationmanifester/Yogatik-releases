import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './document.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '../config/config.service';
import { Readable } from 'stream';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly repo: Repository<Document>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async upload(file: Express.Multer.File, dto: CreateDocumentDto) {
    const maxSize = +this.config.get('MAX_SIZE_BYTES') || 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds limit');
    }

    const key = `${Date.now()}-${file.originalname}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const doc = this.repo.create({
      id: key,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      description: dto.description,
      metadata: dto.metadata || {},
    });
    return this.repo.save(doc);
  }

  async findAll({ page, limit }: { page: number; limit: number }) {
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const doc = await this.repo.findOneBy({ id });
    if (!doc || doc.isDeleted) throw new NotFoundException();
    return doc;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const doc = await this.findOne(id);
    Object.assign(doc, dto);
    return this.repo.save(doc);
  }

  async delete(id: string) {
    const doc = await this.findOne(id);
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    return this.repo.save(doc);
  }

  async download(id: string): Promise<Readable> {
    const doc = await this.findOne(id);
    return this.storage.download(doc.id);
  }
}
