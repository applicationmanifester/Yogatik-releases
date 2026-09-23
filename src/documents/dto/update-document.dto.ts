import { IsString, IsOptional, IsObject, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PartialType } from '@nestjs/mapped-types'
import { CreateDocumentDto } from './create-document.dto'

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {
  // All fields from CreateDocumentDto are optional here
}