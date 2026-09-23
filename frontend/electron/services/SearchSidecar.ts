/**
 * SearchSidecar — Managed lifecycle for local search sidecar process
 */

import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { Logger } from '../core/Logger'

export interface SearchResult {
  title: string
  url: string
  snippet: string
  engine: string
  rank: number
}

export interface SearchOptions {
  count?: number
  recency?: 'any' | 'day' | 'week' | 'month' | 'year'
  engines?: string
  site?: string
}

export class SearchSidecar {
  private process: ChildProcess | null = null
  private port: number | null = null
  private ready = false

  constructor(private readonly logger: Logger) {}

  async start(): Promise<void> {
    const binName = process.platform === 'win32' ? 'search-sidecar.exe' : 'search-sidecar'
    const binPath = join(process.resourcesPath, binName)

    return new Promise((resolve, reject) => {
      this.process = spawn(binPath, ['--port=0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let output = ''
      const timeout = setTimeout(() => {
        this.cleanup()
        reject(new Error('Search sidecar startup timeout'))
      }, 10000)

      this.process.stdout?.on('data', (data) => {
        output += data.toString()
        const match = output.match(/PORT=(\d+)/)
        if (match) {
          this.port = parseInt(match[1], 10)
          this.ready = true
          clearTimeout(timeout)
          this.logger.info('Search sidecar started', { port: this.port })
          resolve()
        }
      })

      this.process.stderr?.on('data', (data) => {
        this.logger.warn('Search sidecar stderr', { data: data.toString() })
      })

      this.process.on('error', (err) => {
        clearTimeout(timeout)
        this.cleanup()
        this.logger.error('Search sidecar failed to start', { error: err.message })
        reject(err)
      })

      this.process.on('exit', (code) => {
        if (this.process) {
          this.cleanup()
          this.logger.warn('Search sidecar exited', { code })
        }
      })
    })
  }

  isReady(): boolean {
    return this.ready && this.port !== null && this.process !== null
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.isReady()) {
      throw new Error('Search sidecar not running')
    }

    const params = new URLSearchParams({
      q: query,
      count: String(options.count || 8),
      recency: options.recency || 'any',
      engines: options.engines || 'all',
    })

    if (options.site) params.set('site', options.site)

    const response = await fetch(`http://127.0.0.1:${this.port}/search?${params}`)
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`)
    }

    const data = await response.json()
    return data.results || data
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.cleanup()
      this.logger.info('Search sidecar stopped')
    }
  }

  private cleanup(): void {
    this.process = null
    this.port = null
    this.ready = false
  }
}