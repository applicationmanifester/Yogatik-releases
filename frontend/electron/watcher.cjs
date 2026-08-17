// File-system watcher — impossible in the browser. Watches a path INSIDE the
// granted folder and streams debounced change events to the renderer, so the
// AI (or a workflow) can react to files changing on disk / auto-reindex.
//
// Scope safety: every watch target is resolved against the fsBridge granted root
// and rejected if it escapes (mirrors the fs_* path guards). No grant → no watch.
//
// Renderer bridge: window.__YOGATIK_WATCHER__.{start,stop,stopAll,list}
// Events: 'fs-changed' { id, type, path }  (path is relative to the granted root)

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getGrantedRoot } = require('./fsBridge.cjs')

const watchers = new Map() // id -> { fsw, relPath, recursive }
let nextId = 1

// Resolve a caller-supplied relative path against the granted root, rejecting
// absolute paths and any `..` escape (realpath re-check when the target exists).
function resolveInRoot(relPath) {
  const root = getGrantedRoot()
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
  ipcMain.handle('watcher:start', (_e, { path: relPath = '.', recursive = true } = {}) => {
    let target
    try { target = resolveInRoot(relPath) } catch (err) { return { success: false, error: err.message } }
    if (!fs.existsSync(target.abs)) return { success: false, error: 'Path does not exist' }

    const id = `w${nextId++}`
    // Debounce bursts (editors write-then-rename) into one event per path.
    const pending = new Map()
    const emit = (type, filename) => {
      const key = `${type}:${filename}`
      if (pending.has(key)) clearTimeout(pending.get(key))
      pending.set(key, setTimeout(() => {
        pending.delete(key)
        const win = getWindow?.()
        if (!win || win.isDestroyed()) return
        // `filename` is relative to the watched dir; make it relative to the root.
        const changedAbs = filename ? path.join(target.abs, filename) : target.abs
        const relFromRoot = path.relative(target.root, changedAbs) || path.basename(changedAbs)
        win.webContents.send('fs-changed', { id, type, path: relFromRoot.split(path.sep).join('/') })
      }, 300))
    }

    try {
      const fsw = fs.watch(target.abs, { recursive: !!recursive }, (eventType, filename) => {
        emit(eventType === 'rename' ? 'rename' : 'change', filename)
      })
      fsw.on('error', () => {}) // watcher errors shouldn't crash main
      watchers.set(id, { fsw, relPath, recursive: !!recursive })
      return { success: true, id, path: relPath, recursive: !!recursive }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('watcher:stop', (_e, id) => {
    const w = watchers.get(id)
    if (!w) return { success: false, error: 'No such watcher' }
    try { w.fsw.close() } catch { /* ignore */ }
    watchers.delete(id)
    return { success: true, id }
  })

  ipcMain.handle('watcher:stopAll', () => {
    for (const w of watchers.values()) { try { w.fsw.close() } catch { /* ignore */ } }
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
  for (const w of watchers.values()) { try { w.fsw.close() } catch { /* ignore */ } }
  watchers.clear()
}

module.exports = { registerWatcher, stopAllWatchers }
