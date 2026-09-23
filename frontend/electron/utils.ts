// ============================================================================
// Shared Utilities
// ============================================================================

import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { join, dirname, resolve, extname, basename } from 'path'
// Worker was used without an import, so it resolved to the DOM Worker (no
// .on/.postMessage semantics used here) — every worker-pool call failed.
import { Worker } from 'worker_threads'

// ---- Hashing ----
export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export function hashFile(path: string): string {
  return hashContent(readFileSync(path))
}

// ---- EOL Handling ----
export type EolType = 'lf' | 'crlf'

export function detectEol(text: string): EolType {
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/\n/g) || []).length - crlf
  return crlf > lf ? 'crlf' : 'lf'
}

export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function applyEol(text: string, eol: EolType): string {
  return eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
}

// ---- Path Safety ----
const ALLOWED_ROOTS = new Set<string>()

export function addAllowedRoot(root: string): void {
  ALLOWED_ROOTS.add(resolve(root))
}

export function isPathAllowed(targetPath: string): boolean {
  const resolved = resolve(targetPath)
  return Array.from(ALLOWED_ROOTS).some(root => resolved.startsWith(root))
}

export function assertPathAllowed(targetPath: string): void {
  if (!isPathAllowed(targetPath)) {
    throw new Error(`Path not allowed: ${targetPath}`)
  }
}

// ---- File Operations ----
export async function readFileSafe(
  path: string,
  options?: { maxBytes?: number; offset?: number; limit?: number }
): Promise<{ content: string; hash: string; size: number; eol: EolType }> {
  assertPathAllowed(path)
  
  const stats = statSync(path)
  const size = stats.size
  const maxBytes = options?.maxBytes ?? 500_000
  const offset = options?.offset ?? 0
  const limit = options?.limit ?? maxBytes
  
  if (offset >= size) {
    return { content: '', hash: '', size, eol: 'lf' }
  }
  
  const readLength = Math.min(limit, size - offset)
  const buffer = Buffer.alloc(readLength)
  const fd = require('fs').openSync(path, 'r')
  try {
    require('fs').readSync(fd, buffer, 0, readLength, offset)
  } finally {
    require('fs').closeSync(fd)
  }
  
  const content = buffer.toString('utf8')
  return {
    content,
    hash: hashContent(buffer),
    size,
    eol: detectEol(content),
  }
}

export async function writeFileSafe(
  path: string,
  content: string,
  expectedHash?: string,
  keepEol?: boolean
): Promise<{ hash: string; size: number }> {
  assertPathAllowed(path)
  
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  
  if (expectedHash && existsSync(path)) {
    const currentHash = hashFile(path)
    if (currentHash !== expectedHash) {
      throw new Error('File hash mismatch — concurrent modification detected')
    }
  }
  
  const finalContent = keepEol ? content : applyEol(toLf(content), detectEol(content))
  writeFileSync(path, finalContent, 'utf8')
  
  const stats = statSync(path)
  return { hash: hashFile(path), size: stats.size }
}

// ---- Edit Application ----
export interface EditOperation {
  oldText: string
  newText: string
}

export function applyEdits(text: string, edits: EditOperation[]): string {
  let result = text
  for (const { oldText, newText } of edits) {
    const idx = result.indexOf(oldText)
    if (idx === -1) {
      throw new Error(`Edit target not found: ${oldText.slice(0, 50)}...`)
    }
    result = result.slice(0, idx) + newText + result.slice(idx + oldText.length)
  }
  return result
}

// ---- Journal ----
const JOURNAL_DIR = join(process.env.APPDATA || process.env.HOME || '/tmp', 'yogatik', 'journal')

export function journalWrite(operation: string, path: string, beforeHash: string, afterHash: string): void {
  if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true })
  const entry = {
    timestamp: new Date().toISOString(),
    operation,
    path,
    beforeHash,
    afterHash,
  }
  writeFileSync(
    join(JOURNAL_DIR, `${Date.now()}.json`),
    JSON.stringify(entry) + '\n',
    { flag: 'a' }
  )
}

// ---- Rate Limiting ----
export class RateLimiter {
  private tokens: Map<string, number> = new Map()
  private lastRefill: Map<string, number> = new Map()
  
  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
    private keyPrefix: string = ''
  ) {}
  
  tryConsume(key: string, tokens = 1): boolean {
    const fullKey = this.keyPrefix + key
    const now = Date.now()
    
    let current = this.tokens.get(fullKey) ?? this.maxTokens
    const last = this.lastRefill.get(fullKey) ?? now
    
    // Refill
    const elapsed = (now - last) / 1000
    current = Math.min(this.maxTokens, current + elapsed * this.refillRate)
    
    if (current >= tokens) {
      this.tokens.set(fullKey, current - tokens)
      this.lastRefill.set(fullKey, now)
      return true
    }
    
    this.tokens.set(fullKey, current)
    this.lastRefill.set(fullKey, now)
    return false
  }
  
  reset(key: string): void {
    this.tokens.delete(this.keyPrefix + key)
    this.lastRefill.delete(this.keyPrefix + key)
  }
}

// Global rate limiters
export const ipcRateLimiter = new RateLimiter(100, 20, 'ipc:') // 100 req, 20/sec refill
export const searchRateLimiter = new RateLimiter(10, 2, 'search:') // 10 req, 2/sec refill
export const procRateLimiter = new RateLimiter(20, 5, 'proc:') // 20 proc, 5/sec refill

// ---- Worker Pool ----
export interface WorkerTask<T = any, R = any> {
  data: T
  resolve: (value: R) => void
  reject: (error: Error) => void
}

export class WorkerPool<T = any, R = any> {
  private workers: Worker[] = []
  private queue: WorkerTask<T, R>[] = []
  private busy = 0
  
  constructor(
    private workerPath: string,
    private size: number,
    private timeoutMs = 30000
  ) {
    for (let i = 0; i < size; i++) {
      this.spawnWorker()
    }
  }
  
  private spawnWorker(): void {
    const worker = new Worker(this.workerPath)
    worker.on('message', (msg: unknown) => {
      this.busy--
      const task = this.queue.shift()
      if (task) {
        this.execute(task)
      }
      // Handle response...
    })
    worker.on('error', (err: Error) => {
      this.busy--
      console.error('[WorkerPool] Worker error:', err)
    })
    this.workers.push(worker)
  }
  
  execute(task: WorkerTask<T, R>): void {
    if (this.busy >= this.workers.length) {
      this.queue.push(task)
      return
    }
    
    const worker = this.workers[this.busy]
    this.busy++
    
    const timeout = setTimeout(() => {
      task.reject(new Error('Worker timeout'))
      worker.terminate()
      this.spawnWorker()
    }, this.timeoutMs)
    
    const handler = (msg: any) => {
      clearTimeout(timeout)
      worker.removeListener('message', handler)
      this.busy--
      if (msg.error) task.reject(new Error(msg.error))
      else task.resolve(msg.result)
      
      // Process queue
      const next = this.queue.shift()
      if (next) this.execute(next)
    }
    
    worker.once('message', handler)
    worker.postMessage(task.data)
  }
  
  async submit(data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.execute({ data, resolve, reject })
    })
  }
  
  terminate(): void {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.queue = []
  }
}

// ---- Safe JSON Parse ----
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

// ---- Debounce ----
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }
}

// ---- Retry ----
export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries: number; delayMs: number; backoff?: number } = { retries: 3, delayMs: 1000 }
): Promise<T> {
  let lastError: Error
  for (let i = 0; i <= options.retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      if (i < options.retries) {
        await new Promise(r => setTimeout(r, options.delayMs * (options.backoff ?? 1) ** i))
      }
    }
  }
  throw lastError!
}

// ---- Browser Rate Limiter (for browserBridge.ts) ----
const browserRateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>()

export const browserRateLimiter = {
  tryConsume(key: string, maxTokens = 10, refillRate = 2): boolean {
    const now = Date.now()
    let bucket = browserRateLimitBuckets.get(key)

    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now }
      browserRateLimitBuckets.set(key, bucket)
    }

    const elapsedSeconds = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsedSeconds * refillRate)
    bucket.lastRefill = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }

    return false
  },

  resetBucket(key: string): void {
    browserRateLimitBuckets.delete(key)
  },

  resetAllBuckets(): void {
    browserRateLimitBuckets.clear()
  }
}

// ---- Path Validation (for browserBridge.ts) ----
import { app } from 'electron'
import { normalize, sep } from 'path'

/**
 * Validates and resolves a file path to prevent directory traversal attacks.
 * Restricts writes to the user's app data directory.
 */
export function validatePath(inputPath: string, safeRoot?: string): string {
  const root = safeRoot || app.getPath('userData')
  const resolvedRoot = resolve(normalize(root))
  const resolvedInput = resolve(normalize(inputPath))

  if (!resolvedInput.startsWith(resolvedRoot + sep) && resolvedInput !== resolvedRoot) {
    throw new Error(`Path traversal attempt blocked: ${inputPath}`)
  }

  return resolvedInput
}