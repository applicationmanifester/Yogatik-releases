/**
 * Structured Logger with request correlation
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  userId?: string
  operation?: string
  [key: string]: unknown
}

export class Logger {
  private readonly prefix: string
  private readonly minLevel: LogLevel
  private static levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

  constructor(prefix: string, minLevel: LogLevel = 'info') {
    this.prefix = prefix
    this.minLevel = minLevel
  }

  child(context: LogContext): Logger {
    const child = new Logger(this.prefix, this.minLevel)
    // Override log method to include context
    const originalLog = child.log.bind(child)
    child.log = (level, message, meta) => originalLog(level, message, { ...context, ...meta })
    return child
  }

  debug(message: string, meta?: LogContext): void { this.log('debug', message, meta) }
  info(message: string, meta?: LogContext): void { this.log('info', message, meta) }
  warn(message: string, meta?: LogContext): void { this.log('warn', message, meta) }
  error(message: string, meta?: LogContext): void { this.log('error', message, meta) }

  private log(level: LogLevel, message: string, meta?: LogContext): void {
    if (Logger.levelOrder[level] < Logger.levelOrder[this.minLevel]) return

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.prefix,
      message,
      ...meta,
    }

    const output = JSON.stringify(entry)

    switch (level) {
      case 'debug':
      case 'info':
        console.log(output)
        break
      case 'warn':
        console.warn(output)
        break
      case 'error':
        console.error(output)
        break
    }
  }
}

// Global logger instance
export const logger = new Logger('app')