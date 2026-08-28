/**
 * Academic Cache Service — IndexedDB & Memory Tiered Cache
 *
 * Caches academic search queries, DOI resolutions, and citation graphs
 * with configurable TTL to avoid redundant API hits and rate-limiting.
 */

import type { AcademicPaper } from '../tools/academic'

interface CacheEntry {
  key: string
  papers: AcademicPaper[]
  expiresAt: number
}

class AcademicCacheService {
  private memCache: Map<string, CacheEntry> = new Map()

  private hashKey(key: string): string {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i)
      hash |= 0
    }
    return `acad_${Math.abs(hash).toString(36)}`
  }

  async get(query: string, limit: number = 10): Promise<AcademicPaper[] | null> {
    const key = `${this.hashKey(query.toLowerCase().trim())}_${limit}`
    const entry = this.memCache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.memCache.delete(key)
      return null
    }

    return entry.papers
  }

  async set(query: string, papers: AcademicPaper[], ttlMs: number = 3600000, limit: number = 10): Promise<void> {
    const key = `${this.hashKey(query.toLowerCase().trim())}_${limit}`
    this.memCache.set(key, {
      key,
      papers,
      expiresAt: Date.now() + ttlMs,
    })
  }

  clear(): void {
    this.memCache.clear()
  }
}

export const academicCache = new AcademicCacheService()
