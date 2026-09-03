// Electron wrapper for codebaseMapCore.cjs — the real fs walk/read plus a
// per-root-set cache, invalidated the same way fsIndex.cjs already is (from
// fsBridge's own mutation choke point and from the fs watcher), so a map
// built once stays cheap on repeat use and never serves stale symbols after
// an edit.

const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron')
const { rootPathsFor } = require('./roots.cjs')
const { scanRoot } = require('./fsIndex.cjs')
const { buildCodebaseMap } = require('./codebaseMapCore.cjs')

/** Building a map is far more expensive than a plain directory listing (it
 *  reads file CONTENT), so it is trusted longer than fsIndex's own 5s TTL —
 *  invalidation from the watcher/fsBridge is what keeps it honest in between. */
const TTL_MS = 2 * 60_000
/** One file's worth of source is read for its top-level exports, not its
 *  whole body — most real source files are well under this; a file that
 *  isn't says so via `truncated` rather than silently reading past it. */
const MAX_BYTES_PER_FILE = 60_000
/** An external change (the watcher's own case) settles into a burst, not one
 *  event — a `git checkout` or `npm install` is hundreds of them. Rebuilding
 *  after every one would cost far more than the map it is trying to keep
 *  fresh; this waits for the burst to end before paying for one rebuild. */
const REWARM_DEBOUNCE_MS = 4_000

const cache = new Map() // key -> { at, roots, subPath, maxFiles, result }
const pendingRewarm = new Map() // key -> Timeout

function keyFor(roots, subPath, maxFiles) {
  return `${roots.join('|')}::${subPath || ''}::${maxFiles}`
}

function touchesRoot(changedAbs, roots) {
  return roots?.some((r) => changedAbs === r || changedAbs.startsWith(r + path.sep) || r.startsWith(changedAbs + path.sep))
}

/**
 * A chat can hold SEVERAL bound folders (CLAUDE.md: "Claude Code's /add-dir
 * model"), and two of them can each have a file at the exact same relative
 * path — a monorepo's `frontend/src/index.js` and `backend/src/index.js`
 * both walk down to `src/index.js` once each root is stripped. Displaying the
 * bare relative path in that case is not just cosmetic confusion: readFile
 * needs to resolve ONE absolute path per displayed path, so a real collision
 * would silently read the same root's file twice and never the other's.
 * Prefixing every root's files with a short, unique label removes the
 * collision at the source instead of trying to disambiguate an already-
 * collided string. Labels are the folder's own basename, deduped with a
 * numeric suffix only in the rare case two bound roots share one.
 */
function labelsForRoots(roots) {
  const baseOf = (r) => path.basename(r) || r
  const counts = new Map()
  for (const r of roots) counts.set(baseOf(r), (counts.get(baseOf(r)) || 0) + 1)
  const seen = new Map()
  return roots.map((r) => {
    const base = baseOf(r)
    if (counts.get(base) === 1) return base
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    return `${base}-${n}`
  })
}

async function readCapped(filePath) {
  const fh = await fs.promises.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(MAX_BYTES_PER_FILE)
    const { bytesRead } = await fh.read(buf, 0, MAX_BYTES_PER_FILE, 0)
    return buf.toString('utf8', 0, bytesRead)
  } finally {
    await fh.close()
  }
}

/** The actual walk-and-read, shared by the IPC handler and the background
 *  rewarm path so there is exactly one place that knows how to build a map. */
async function buildAndCache(roots, subPath, cappedMaxFiles) {
  const scanRoots = subPath ? [path.resolve(roots[0], subPath)] : roots
  // Only ambiguous when more than one root is actually being walked in this
  // call — a `path`-narrowed call always resolves to exactly one, so it
  // never needs (or gets) a label prefix cluttering otherwise-plain paths.
  const rootLabels = scanRoots.length > 1 ? labelsForRoots(scanRoots) : null
  const absoluteFor = new Map() // displayed path -> absolute path

  const result = await buildCodebaseMap({
    listFiles: async () => {
      const rel = []
      for (let i = 0; i < scanRoots.length; i++) {
        const root = scanRoots[i]
        const { entries } = await scanRoot(root, { maxDepth: 40, includeIgnored: false })
        const prefix = rootLabels ? `${rootLabels[i]}/` : (subPath ? subPath.replace(/\/+$/, '') + '/' : '')
        for (const e of entries) {
          if (e.isDir) continue
          const displayed = prefix + e.rel
          absoluteFor.set(displayed, e.path)
          rel.push(displayed)
        }
      }
      return rel
    },
    readFile: async (relPath) => {
      const abs = absoluteFor.get(relPath)
      if (!abs) throw new Error(`Internal: no absolute path recorded for ${relPath}`)
      return readCapped(abs)
    },
    maxFiles: cappedMaxFiles,
  })

  const key = keyFor(roots, subPath, cappedMaxFiles)
  cache.set(key, { at: Date.now(), roots: roots.map(r => path.resolve(r)), subPath, maxFiles: cappedMaxFiles, result })
  return result
}

/** Drop cached maps touching `changedPath` — used for an AGENT-driven
 *  mutation (fsBridge's snapshot()). No rewarm here on purpose: the agent
 *  that just wrote the file is the one most likely to ask for a fresh map
 *  next, on its own schedule — speculatively rebuilding on every edit it
 *  makes would just be paying twice for work it may never ask for again. */
function invalidate(changedPath = null) {
  if (!changedPath) { cache.clear(); return }
  const changed = path.resolve(changedPath)
  for (const [key, value] of cache) {
    if (touchesRoot(changed, value.roots)) cache.delete(key)
  }
}

/**
 * The watcher's case: an EXTERNAL change (the user's own editor, a build
 * step, a `git checkout`) that nobody is about to follow up with a tool call.
 * Drops the same stale entries `invalidate` would, and — only for a root-set
 * that was ALREADY mapped before this — schedules a debounced rebuild, so the
 * next time anyone (agent or the map panel) asks, the map is already warm
 * instead of paying the full walk+read cost inline. A folder that was never
 * mapped is never proactively built here: that would spend real disk/CPU on
 * every granted folder whether or not the map feature is ever used, the exact
 * "a download is a decision, not a fallback" mistake this codebase already
 * avoids for local models and ComfyUI.
 */
function invalidateAndRewarm(changedPath = null) {
  if (!changedPath) { cache.clear(); return }
  const changed = path.resolve(changedPath)
  const toRewarm = []
  for (const [key, value] of cache) {
    if (touchesRoot(changed, value.roots)) {
      cache.delete(key)
      toRewarm.push({ key, roots: value.roots, subPath: value.subPath, maxFiles: value.maxFiles })
    }
  }
  for (const entry of toRewarm) {
    const existing = pendingRewarm.get(entry.key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      pendingRewarm.delete(entry.key)
      buildAndCache(entry.roots, entry.subPath, entry.maxFiles).catch(() => {
        // Best effort: a failed background rewarm just means the next real
        // call rebuilds inline instead, same as if this never ran.
      })
    }, REWARM_DEBOUNCE_MS)
    if (typeof timer.unref === 'function') timer.unref() // must never keep the app alive for this
    pendingRewarm.set(entry.key, timer)
  }
}

function registerCodebaseMap() {
  ipcMain.handle('fs_codebase_map', async (_e, { ctx, path: subPath = '', maxFiles = 600, forceRefresh = false } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) throw new Error('no folder granted')

    const cappedMaxFiles = Math.max(1, Math.min(4000, Number(maxFiles) || 600))
    const key = keyFor(roots, subPath, cappedMaxFiles)
    if (!forceRefresh) {
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.result, cached: true }
    }

    const result = await buildAndCache(roots, subPath, cappedMaxFiles)
    return { ...result, cached: false }
  })
}

module.exports = { registerCodebaseMap, invalidate, invalidateAndRewarm, buildAndCache, _cache: cache, _pendingRewarm: pendingRewarm }
