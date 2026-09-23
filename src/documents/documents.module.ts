import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentsService } from './documents.service'
import { DocumentsController } from './documents.controller'
import { Document } from './document.entity'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [TypeOrmModule.forFeature([Document]), StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}