import { Module, Global } from '@nestjs/common'
import { S3StorageService } from './s3.storage.service'
import { StorageService } from './storage.service'

/**
 * Interfaces cannot be NestJS provider tokens (they are erased at runtime);
 * the standard pattern is a Symbol injection token bound to the concrete
 * implementation, with @Inject(STORAGE_SERVICE) at the consumption site.
 */
export const STORAGE_SERVICE = Symbol('StorageService')

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: S3StorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

// Re-export the type with the token so consumers can do:
//   @Inject(STORAGE_SERVICE) private readonly storage: StorageService
export type { StorageService }