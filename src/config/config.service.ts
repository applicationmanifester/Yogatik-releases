import { Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService) {}

  get(key: string): string | undefined {
    return this.config.get(key)
  }

  getOrThrow(key: string): string {
    const value = this.config.get(key)
    if (!value) {
      throw new Error(`Configuration key "${key}" is not set`)
    }
    return value
  }

  getNumber(key: string): number | undefined {
    const value = this.config.get(key)
    return value ? parseInt(value, 10) : undefined
  }

  getBoolean(key: string): boolean | undefined {
    const value = this.config.get(key)
    return value ? value === 'true' : undefined
  }
}