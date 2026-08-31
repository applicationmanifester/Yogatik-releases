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
   * Generates a unique cache key for a file path IN ONE CHAT'S WORKSPACE.
   *
   * The scope is not decoration. Every chat has its own working folders, and
   * tool paths are routinely RELATIVE to them, so two chats both reading
   * "src/index.js" collide on a path-only key — and the second one is served
   * the first one's file, reported as `success: true, cached: true`. That is a
   * cross-chat content leak that looks exactly like a fast read.
   */
  _key(path, scope) {
    const p = String(path || '').toLowerCase().replace(/\\/g, '/')
    return `${scope == null ? '' : String(scope)}::${p}`
  }

  /**
   * Retrieves content from cache if mtime and size match.
   */
  get(path, mtimeMs, size, scope) {
    const k = this._key(path, scope)
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
  set(path, content, mtimeMs = Date.now(), size = null, scope) {
    const k = this._key(path, scope)
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
   * Invalidates a path in EVERY workspace, not just the caller's.
   *
   * Reads are scoped so one chat can never be served another's file; writes
   * must NOT be, because two chats are allowed to hold the SAME folder. Were
   * invalidation scoped too, a write in chat A would leave chat B serving the
   * pre-write bytes for a file they genuinely share — trading a leak for a
   * staleness bug. Scoped reads, global invalidation.
   */
  invalidate(path) {
    const suffix = `::${String(path || '').toLowerCase().replace(/\\/g, '/')}`
    let hit = false
    for (const k of [...this.cache.keys()]) {
      if (!k.endsWith(suffix)) continue
      this.currentBytes -= this.cache.get(k).size
      this.cache.delete(k)
      hit = true
    }
    return hit
  }

  /** Drop everything belonging to one chat (its folders were unbound). */
  invalidateScope(scope) {
    const prefix = `${scope == null ? '' : String(scope)}::`
    for (const k of [...this.cache.keys()]) {
      if (!k.startsWith(prefix)) continue
      this.currentBytes -= this.cache.get(k).size
      this.cache.delete(k)
    }
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
