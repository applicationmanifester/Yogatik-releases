import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { DocumentsModule } from './documents/documents.module'
import { StorageModule } from './storage/storage.module'
import { ConfigService } from './config/config.service'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    DocumentsModule,
    StorageModule,
    AuthModule,
  ],
  providers: [ConfigService],
})
export class AppModule {}