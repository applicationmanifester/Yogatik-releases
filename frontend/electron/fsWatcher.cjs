// File watching, scoped to a chat's bound roots.
//
// Uses bare fs.watch (recursive) rather than adding chokidar: no new dependency,
// and recursive watch is supported on Windows and macOS — the two desktop
// targets. On Linux fs.watch is not recursive, so the watcher degrades to the
// top level and says so rather than pretending to see everything.

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { shouldSkipDir } = require('./searchFilter.cjs')

const RECURSIVE_SUPPORTED = process.platform === 'win32' || process.platform === 'darwin'
const DEBOUNCE_MS = 250

const watchers = new Map() // chatId -> { handles: [], events: [], timer }

function noteEvent(state, relPath) {
  if (!relPath) return
  const first = String(relPath).split(/[\\/]/)[0]
  if (shouldSkipDir(first)) return          // ignore node_modules/.git churn
  state.events.push({ path: relPath, at: Date.now() })
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500)
}

function startWatching(chatId, roots) {
  stopWatching(chatId)
  const state = { handles: [], events: [], recursive: RECURSIVE_SUPPORTED }
  for (const root of roots) {
    try {
      const h = fs.watch(root, { recursive: RECURSIVE_SUPPORTED }, (_type, filename) => {
        noteEvent(state, filename)
      })
      state.handles.push(h)
    } catch { /* unreadable root — skip it */ }
  }
  watchers.set(String(chatId), state)
  return { success: true, roots: roots.length, recursive: state.recursive }
}

function stopWatching(chatId) {
  const state = watchers.get(String(chatId))
  if (!state) return { success: true }
  for (const h of state.handles) { try { h.close() } catch { /* ignore */ } }
  watchers.delete(String(chatId))
  return { success: true }
}

/** Drain the events seen since the last call. */
function drainChanges(chatId) {
  const state = watchers.get(String(chatId))
  if (!state) return { success: false, error: 'Not watching this chat’s folders.' }
  const events = state.events
  state.events = []
  const unique = [...new Set(events.map(e => e.path))]
  return { success: true, changed: unique, count: unique.length, recursive: state.recursive }
}

function stopAllFsWatchers() {
  for (const id of [...watchers.keys()]) stopWatching(id)
}

function registerFsWatcherIpc({ rootPathsFor }) {
  ipcMain.handle('watch_start', (_e, { ctx } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { success: false, error: 'No working folder for this chat.' }
    return startWatching(ctx?.conversationId, roots)
  })
  ipcMain.handle('watch_stop', (_e, { ctx } = {}) => stopWatching(ctx?.conversationId))
  ipcMain.handle('watch_changes', (_e, { ctx } = {}) => drainChanges(ctx?.conversationId))
}

module.exports = { registerFsWatcherIpc, startWatching, stopWatching, drainChanges, stopAllFsWatchers, noteEvent, RECURSIVE_SUPPORTED, DEBOUNCE_MS, path }
