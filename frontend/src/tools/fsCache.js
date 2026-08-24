/**
 * fsCache.js — In-Memory High-Speed Filesystem Content Cache.
 * Speeds up repetitive multi-agent and tool workspace file reads with
 * mtime validation and LRU eviction.
 */

class FsContentCache {
  constructor(maxEntries = 100, maxTotalBytes = 10 * 1024 * 1024) {
    this.maxEntries = maxEntries
    this.maxTotalBytes = maxTotalBytes
    this.cache = new Map()
    this.currentBytes = 0
  }

  /**
   * Generates a unique cache key for a file path.
   */
  _key(path) {
    return String(path || '').toLowerCase().replace(/\\/g, '/')
  }

  /**
   * Retrieves content from cache if mtime and size match.
   */
  get(path, mtimeMs, size) {
    const k = this._key(path)
    const entry = this.cache.get(k)
    if (!entry) return null

    // Validate freshness
    if (mtimeMs != null && entry.mtimeMs !== mtimeMs) {
      this.cache.delete(k)
      this.currentBytes -= entry.size
      return null
    }

    if (size != null && entry.size !== size) {
      this.cache.delete(k)
      this.currentBytes -= entry.size
      return null
    }

    // Refresh LRU position
    this.cache.delete(k)
    this.cache.set(k, entry)
    return entry.content
  }

  /**
   * Stores content in the cache.
   */
  set(path, content, mtimeMs = Date.now(), size = null) {
    const k = this._key(path)
    const text = String(content || '')
    const bytes = size != null ? Number(size) : text.length

    // Skip if single item is larger than cache budget
    if (bytes > this.maxTotalBytes / 2) return

    // Invalidate existing
    if (this.cache.has(k)) {
      this.currentBytes -= this.cache.get(k).size
      this.cache.delete(k)
    }

    // Evict oldest if needed
    while (
      (this.cache.size >= this.maxEntries || this.currentBytes + bytes > this.maxTotalBytes) &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value
      const oldEntry = this.cache.get(oldestKey)
      this.currentBytes -= oldEntry.size
      this.cache.delete(oldestKey)
    }

    this.cache.set(k, { content: text, mtimeMs, size: bytes })
    this.currentBytes += bytes
  }

  /**
   * Invalidates a specific file path.
   */
  invalidate(path) {
    const k = this._key(path)
    if (this.cache.has(k)) {
      this.currentBytes -= this.cache.get(k).size
      this.cache.delete(k)
      return true
    }
    return false
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.cache.clear()
    this.currentBytes = 0
  }

  /**
   * Gets stats on cache usage.
   */
  stats() {
    return {
      entries: this.cache.size,
      bytes: this.currentBytes,
      maxEntries: this.maxEntries,
      maxBytes: this.maxTotalBytes,
    }
  }
}

export const globalFsCache = new FsContentCache()
