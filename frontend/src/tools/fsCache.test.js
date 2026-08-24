import { describe, it, expect, beforeEach } from 'vitest'
import { globalFsCache } from './fsCache'

describe('FsContentCache', () => {
  beforeEach(() => {
    globalFsCache.clear()
  })

  it('stores and retrieves cached file content', () => {
    globalFsCache.set('src/index.js', 'console.log("hello")', 1000, 21)
    const cached = globalFsCache.get('src/index.js', 1000, 21)
    expect(cached).toBe('console.log("hello")')
  })

  it('invalidates cache when mtime changes', () => {
    globalFsCache.set('src/index.js', 'console.log("hello")', 1000, 21)
    const stale = globalFsCache.get('src/index.js', 2000, 21)
    expect(stale).toBeNull()
  })

  it('supports explicit path invalidation', () => {
    globalFsCache.set('src/index.js', 'content', 1000, 7)
    expect(globalFsCache.get('src/index.js')).toBe('content')
    globalFsCache.invalidate('src/index.js')
    expect(globalFsCache.get('src/index.js')).toBeNull()
  })

  it('tracks stats accurately', () => {
    globalFsCache.set('file1.txt', '12345', 1000, 5)
    globalFsCache.set('file2.txt', '67890', 1000, 5)
    const stats = globalFsCache.stats()
    expect(stats.entries).toBe(2)
    expect(stats.bytes).toBe(10)
  })
})
