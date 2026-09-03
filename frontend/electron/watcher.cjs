// File-system watcher — impossible in the browser. Watches a path INSIDE the
// granted folder and streams debounced change events to the renderer, so the
// AI (or a workflow) can react to files changing on disk / auto-reindex.
//
// Scope safety: every watch target is resolved against the fsBridge granted root
// and rejected if it escapes (mirrors the fs_* path guards). No grant → no watch.
//
// Renderer bridge: window.__YOGATIK_WATCHER__.{start,stop,stopAll,list}
// Events: 'fs-changed' { id, type, path, changes[], truncated }
//   `path`/`type` are the FIRST change in the window, kept so older consumers
//   keep working; `changes` is every change in it. type 'git' means the
//   repository state moved, not that a tree row did. Paths are relative to the
//   granted root.

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
// fsBridge does not export getGrantedRoot — this import was undefined and every
// watcher:start threw "getGrantedRoot is not a function", so watch_folder never
// worked. Roots come from roots.cjs.
const { rootPathsFor } = require('./roots.cjs')
const { invalidate } = require('./fsIndex.cjs')
const { safeSend, alive } = require('./safeWindow.cjs')
// Same optional-require as fsBridge.cjs — an external edit (the user's own
// editor, a build step, a git checkout) is exactly the case a codebase map
// cache must not survive, and this watcher is the only place that sees it.
// invalidateAndRewarm (not the plain invalidate fsBridge uses) also schedules
// a debounced background rebuild for any root-set that was already mapped —
// an EXTERNAL change has nobody about to ask for a fresh map next, unlike an
// agent-driven edit, so keeping it warm here is the one place it pays off.
let codebaseMapInvalidate = null
try { codebaseMapInvalidate = require('./codebaseMap.cjs').invalidateAndRewarm } catch { /* optional */ }
const getGrantedRoot = (ctx) => rootPathsFor(ctx)[0] || null

const watchers = new Map() // id -> { fsw, relPath, recursive }
let nextId = 1

// The noise rules live in watchFilter.cjs — pure, so vitest can reach them;
// this file requires electron and cannot be imported from a test.
const { classify } = require('./watchFilter.cjs')

/** Events forwarded per flush. A burst larger than this is reported as one
 *  truncated batch — the consumer's correct response is a full refresh, and
 *  sending 5,000 payloads to say so is strictly worse. */
const MAX_BATCH = 200
/** One window for the whole watcher, not one timer per changed path. */
const FLUSH_MS = 250

// Resolve a caller-supplied relative path against the granted root, rejecting
// absolute paths and any `..` escape (realpath re-check when the target exists).
function resolveInRoot(relPath, ctx) {
  const root = getGrantedRoot(ctx)
  if (!root) throw new Error('No folder granted')
  const rel = String(relPath || '.')
  if (path.isAbsolute(rel)) throw new Error('Absolute paths are not allowed')
  const abs = path.resolve(root, rel)
  const rootResolved = path.resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new Error('Path escapes the granted folder')
  }
  try {
    const real = fs.realpathSync(abs)
    const realRoot = fs.realpathSync(rootResolved)
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new Error('Path escapes the granted folder')
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e // non-existent target is fine to reject later
  }
  return { abs, root: rootResolved }
}

function registerWatcher(getWindow) {
  ipcMain.handle('watcher:start', (_e, { ctx, path: relPath = '.', recursive = true } = {}) => {
    let target
    try { target = resolveInRoot(relPath, ctx) } catch (err) { return { success: false, error: err.message } }
    if (!fs.existsSync(target.abs)) return { success: false, error: 'Path does not exist' }

    const id = `w${nextId++}`
    // ONE pending map and ONE timer for the whole watcher. The previous version
    // kept a timer per changed path, so a burst allocated thousands of timers
    // and then fired thousands of separate IPC messages.
    const pending = new Map()   // rel -> type
    let truncated = false
    let timer = null

    const flush = () => {
      timer = null
      const changes = [...pending].map(([p, type]) => ({ type, path: p }))
      const wasTruncated = truncated
      pending.clear()
      truncated = false
      if (!changes.length && !wasTruncated) return
      const win = getWindow?.()
      if (!alive(win)) return
      // Backward-compatible shape: existing consumers read {type, path} and
      // still get the first change; the tree reads `changes` and handles the
      // whole window in one pass.
      safeSend(win, 'fs-changed', {
        id,
        type: changes[0]?.type || 'change',
        path: changes[0]?.path || '',
        changes,
        truncated: wasTruncated,
      })
    }

    const emit = (type, filename) => {
      // `filename` is relative to the watched dir; make it relative to the root.
      const changedAbs = filename ? path.join(target.abs, filename) : target.abs
      const relFromRoot = path.relative(target.root, changedAbs) || path.basename(changedAbs)
      const rel = relFromRoot.split(path.sep).join('/')

      // The cached file index is now stale — but only for the directory that
      // actually changed. fsBridge invalidates on its OWN mutations; an edit
      // from the user's editor, a build step or a git checkout arrives only
      // here. Scoping it is what stops one .git write from discarding the
      // listing of the folder the user is looking at.
      try { invalidate(changedAbs) } catch { /* cache only */ }
      try { codebaseMapInvalidate?.(changedAbs) } catch { /* cache only */ }

      const kind = classify(rel)
      if (!kind) return

      if (pending.size >= MAX_BATCH && !pending.has(rel)) { truncated = true; return }
      // A rename beats a content change for the same path in one window: it is
      // the one that tells the tree a row appeared or disappeared.
      if (type === 'rename' || !pending.has(rel)) pending.set(rel, kind === 'git' ? 'git' : type)
      if (!timer) timer = setTimeout(flush, FLUSH_MS)
    }

    try {
      const fsw = fs.watch(target.abs, { recursive: !!recursive }, (eventType, filename) => {
        emit(eventType === 'rename' ? 'rename' : 'change', filename)
      })
      fsw.on('error', () => {}) // watcher errors shouldn't crash main
      // The flush timer outlives fsw.close() unless it is cancelled here; a
      // stopped watcher that still fires one last IPC is a use-after-free
      // waiting for a window teardown to coincide with it.
      watchers.set(id, { fsw, relPath, recursive: !!recursive, cancel: () => clearTimeout(timer) })
      return { success: true, id, path: relPath, recursive: !!recursive }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('watcher:stop', (_e, id) => {
    const w = watchers.get(id)
    if (!w) return { success: false, error: 'No such watcher' }
    try { w.cancel?.(); w.fsw.close() } catch { /* ignore */ }
    watchers.delete(id)
    return { success: true, id }
  })

  ipcMain.handle('watcher:stopAll', () => {
    for (const w of watchers.values()) { try { w.cancel?.(); w.fsw.close() } catch { /* ignore */ } }
    const count = watchers.size
    watchers.clear()
    return { success: true, count }
  })

  ipcMain.handle('watcher:list', () => ({
    success: true,
    watchers: [...watchers.entries()].map(([id, w]) => ({ id, path: w.relPath, recursive: w.recursive })),
  }))
}

function stopAllWatchers() {
  for (const w of watchers.values()) { try { w.cancel?.(); w.fsw.close() } catch { /* ignore */ } }
  watchers.clear()
}

module.exports = { registerWatcher, stopAllWatchers }
