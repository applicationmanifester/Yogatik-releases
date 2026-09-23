/**
 * IpcRouter — Typed IPC with error boundaries, logging, and validation
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { Logger, LogContext } from './Logger'

export interface IpcHandler<TArgs extends unknown[], TReturn> {
  (...args: TArgs): TReturn | Promise<TReturn>
}

export interface IpcHandlerOptions {
  validate?: (args: unknown[]) => { valid: boolean; error?: string }
  timeout?: number
}

export class IpcRouter {
  private handlers = new Map<string, { handler: Function; options: IpcHandlerOptions }>()

  constructor(private readonly logger: Logger) {}

  register<TArgs extends unknown[], TReturn>(
    channel: string,
    handler: IpcHandler<TArgs, TReturn>,
    options: IpcHandlerOptions = {}
  ): void {
    if (this.handlers.has(channel)) {
      this.logger.warn(`IPC handler already registered for channel: ${channel}`)
    }

    const wrappedHandler = async (event: IpcMainInvokeEvent, ...args: TArgs): Promise<TReturn> => {
      const requestId = this.generateRequestId()
      const ctx: LogContext = { requestId, operation: channel }
      const childLogger = this.logger.child(ctx)

      childLogger.debug('IPC request received', { args: this.sanitizeArgs(args) })

      const startTime = Date.now()

      try {
        // Validation
        if (options.validate) {
          const validation = options.validate(args)
          if (!validation.valid) {
            childLogger.warn('IPC validation failed', { error: validation.error })
            throw new IpcError('INVALID_ARGS', validation.error || 'Invalid arguments')
          }
        }

        // Timeout
        let result: TReturn
        if (options.timeout) {
          result = await this.withTimeout(
            Promise.resolve(handler(...args)),
            options.timeout,
            `IPC handler timeout: ${channel}`
          )
        } else {
          result = await handler(...args)
        }

        const duration = Date.now() - startTime
        childLogger.info('IPC request completed', { durationMs: duration })
        return result
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorCode = error instanceof IpcError ? error.code : 'INTERNAL_ERROR'

        childLogger.error('IPC request failed', {
          durationMs: duration,
          error: errorMessage,
          code: errorCode,
          stack: error instanceof Error ? error.stack : undefined,
        })

        // Re-throw as IpcError for consistent error handling
        if (error instanceof IpcError) throw error
        throw new IpcError('INTERNAL_ERROR', errorMessage)
      }
    }

    ipcMain.handle(channel, wrappedHandler)
    this.handlers.set(channel, { handler, options })
  }

  unregister(channel: string): void {
    ipcMain.removeHandler(channel)
    this.handlers.delete(channel)
  }

  unregisterAll(): void {
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel)
    }
    this.handlers.clear()
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timeoutId: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new IpcError('TIMEOUT', message)), ms)
    })
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId!)
    }
  }

  private generateRequestId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  private sanitizeArgs(args: unknown[]): unknown[] {
    // Remove sensitive data from logs
    return args.map(arg => {
      if (arg && typeof arg === 'object') {
        const sanitized = { ...arg } as Record<string, unknown>
        const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization']
        for (const key of Object.keys(sanitized)) {
          if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
            sanitized[key] = '[REDACTED]'
          }
        }
        return sanitized
      }
      return arg
    })
  }
}

export class IpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'IpcError'
  }
}