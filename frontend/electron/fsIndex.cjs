// An async, cached file index for the granted roots.
//
// TWO problems, both measurable on any real repository:
//
// 1. The walk was fs.readdirSync, recursing up to 20,000 entries, running on
//    the Electron MAIN process — which is also the process that composites the
//    window. Every fs_search and every fs_find_files froze the entire app for
//    the duration of the walk. Async readdir hands the syscalls to libuv's
//    threadpool and the yield below returns to the event loop periodically, so
//    the UI keeps painting while a large tree is scanned.
//
// 2. Nothing was cached. Each search re-walked the tree AND re-read the root
//    .gitignore from disk, so asking three questions about one repository paid
//    for three full traversals. The index is cached per root and invalidated by
//    the fs watcher that already exists (watcher.cjs), so the second question
//    is effectively free.
//
// Electron-free so it can be tested directly.

const fs = require('fs')
const path = require('path')
const { shouldSkipDir, parseGitignore, makeIgnoreMatcher } = require('./searchFilter.cjs')

/** Hard ceiling on entries held for one root. Beyond this the index is partial
 *  and says so, rather than growing until the process runs out of memory. */
const MAX_ENTRIES = 50_000
/** Entries scanned between yields back to the event loop. */
const YIELD_EVERY = 500
/** How long an index is trusted without a watcher event. */
const TTL_MS = 5_000

const cache = new Map()   // key -> { at, entries, partial, roots }

const yieldToLoop = () => new Promise((r) => setImmediate(r))

/**
 * .gitignore files compose: a rule in src/.gitignore applies below src/, not
 * at the root. Reading only the root file (what the bridge did) means a
 * package with its own ignore rules gets walked in full.
 */
function ignoreLoader() {
  const cached = new Map()
  return async function matcherFor(dir) {
    if (cached.has(dir)) return cached.get(dir)
    let matcher = null
    try {
      const text = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8')
      matcher = makeIgnoreMatcher(parseGitignore(text))
    } catch { matcher = null }
    cached.set(dir, matcher)
    return matcher
  }
}

/**
 * Walk one root.
 * @returns {Promise<{entries: Array<{path,rel,name,isDir,size,mtimeMs}>, partial: boolean}>}
 */
async function scanRoot(root, { maxDepth = 40, includeIgnored = false, withStats = false } = {}) {
  const entries = []
  const matcherFor = ignoreLoader()
  const depthCap = Math.max(0, Math.min(40, maxDepth))
  let scanned = 0
  let partial = false

  // Iterative, not recursive: a deep tree used to be bounded only by the JS
  // stack, and the failure mode was a RangeError in the middle of a search.
  const queue = [{ dir: root, depth: 0, ignores: [] }]

  while (queue.length) {
    const { dir, depth, ignores } = queue.shift()
    let dirents
    try { dirents = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { continue }

    const local = includeIgnored ? null : await matcherFor(dir)
    const chain = local ? [...ignores, { base: dir, match: local }] : ignores

    for (const d of dirents) {
      const full = path.join(dir, d.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')

      if (!includeIgnored) {
        if (d.isDirectory() && shouldSkipDir(d.name)) continue
        let ignored = false
        for (const g of chain) {
          const sub = path.relative(g.base, full).replace(/\\/g, '/')
          if (sub && g.match(sub)) { ignored = true; break }
        }
        if (ignored) continue
      }

      const entry = { path: full, rel, name: d.name, isDir: d.isDirectory() }
      if (withStats) {
        try {
          const st = await fs.promises.stat(full)
          entry.size = st.size
          entry.mtimeMs = st.mtimeMs
        } catch { entry.size = 0; entry.mtimeMs = 0 }
      }
      entries.push(entry)

      if (entries.length >= MAX_ENTRIES) { partial = true; break }
      if (d.isDirectory() && depth < depthCap) queue.push({ dir: full, depth: depth + 1, ignores: chain })

      // The yield is the whole point: without it this is a synchronous freeze
      // wearing an async signature.
      if (++scanned % YIELD_EVERY === 0) await yieldToLoop()
    }
    if (partial) break
  }

  return { entries, partial }
}

function keyFor(roots, opts) {
  return `${roots.join('|')}::${opts.maxDepth ?? 40}::${opts.includeIgnored ? 1 : 0}::${opts.withStats ? 1 : 0}`
}

/**
 * The cached index across every root bound to a chat.
 * @param {string[]} roots
 */
async function getIndex(roots, opts = {}) {
  const key = keyFor(roots, opts)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit

  const all = []
  let partial = false
  for (const root of roots) {
    const r = await scanRoot(root, opts)
    for (const e of r.entries) all.push({ ...e, root })
    partial = partial || r.partial
  }
  const value = { at: Date.now(), entries: all, partial, roots }
  cache.set(key, value)
  return value
}

/**
 * Drop cached indexes touching `root`. watcher.cjs already emits on every
 * change inside a granted folder; this is what makes the cache safe rather
 * than merely fast.
 */
function invalidate(root = null) {
  if (!root) { cache.clear(); return }
  for (const [key, value] of cache) {
    if (value.roots?.some((r) => r === root || root.startsWith(r) || r.startsWith(root))) cache.delete(key)
  }
}

module.exports = { scanRoot, getIndex, invalidate, MAX_ENTRIES, TTL_MS, _cache: cache }
