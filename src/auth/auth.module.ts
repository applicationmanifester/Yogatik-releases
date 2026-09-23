import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { JwtAuthGuard } from './auth.guard'
import { ConfigService } from '../config/config.service'
import { Reflector } from '@nestjs/core'

@Module({
  imports: [JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      secret: config.getOrThrow('JWT_SECRET'),
      signOptions: { expiresIn: '1h' },
    }),
  })],
  providers: [JwtAuthGuard, Reflector],
  exports: [JwtAuthGuard],
})
export class AuthModule {}