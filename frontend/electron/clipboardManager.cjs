// Clipboard read + rolling history. The browser can only read the clipboard on
// focus, with a permission prompt, and keeps no history — this gives Yogatik
// desktop full read access plus a capped in-memory history the AI can act on.
//
// Renderer bridge: window.__YOGATIK_CLIPBOARD__.{read,write,history,clear}.
// A global hotkey (Ctrl+Alt+C, registered in main.cjs) copies the current
// selection and relays it to the renderer as a ready-to-send prompt.

const { ipcMain, clipboard } = require('electron')
const { safeSend } = require('./safeWindow.cjs')

const MAX_HISTORY = 50
let history = [] // [{ text, at }] newest-first, text-only (images excluded)
let poller = null
let lastSeen = ''

function pushHistory(text) {
  if (!text || typeof text !== 'string') return
  if (text === lastSeen) return
  lastSeen = text
  // De-dupe: drop an older identical entry, then unshift.
  history = history.filter(h => h.text !== text)
  history.unshift({ text, at: Date.now() })
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
}

function readClipboard() {
  const text = clipboard.readText() || ''
  const formats = clipboard.availableFormats() || []
  const hasImage = formats.some(f => f.startsWith('image/'))
  let image = null
  if (hasImage) {
    try {
      const img = clipboard.readImage()
      if (img && !img.isEmpty()) image = img.toDataURL()
    } catch { /* image read best-effort */ }
  }
  return { text, formats, hasImage, image }
}

// Poll so history captures copies made in OTHER apps too (there is no OS
// clipboard-change event on Windows without native hooks).
function startPolling(getWindow) {
  if (poller) return
  poller = setInterval(() => {
    try {
      const text = clipboard.readText() || ''
      if (text && text !== lastSeen) {
        pushHistory(text)
        safeSend(getWindow?.(), 'clipboard-changed', { text, at: Date.now() })
      }
    } catch { /* ignore transient clipboard locks */ }
  }, 800)
  if (poller.unref) poller.unref()
}

function stopPolling() {
  if (poller) { clearInterval(poller); poller = null }
}

function registerClipboard(getWindow) {
  ipcMain.handle('clipboard:read', () => {
    const snap = readClipboard()
    if (snap.text) pushHistory(snap.text)
    return { success: true, ...snap }
  })

  ipcMain.handle('clipboard:write', (_e, text) => {
    if (typeof text !== 'string') return { success: false, error: 'text must be a string' }
    clipboard.writeText(text)
    pushHistory(text)
    return { success: true, length: text.length }
  })

  ipcMain.handle('clipboard:history', (_e, limit) => {
    const n = Math.max(1, Math.min(MAX_HISTORY, Number(limit) || MAX_HISTORY))
    return { success: true, items: history.slice(0, n) }
  })

  ipcMain.handle('clipboard:clear', () => {
    history = []
    return { success: true }
  })

  startPolling(getWindow)
}

module.exports = { registerClipboard, stopPolling, _pushHistory: pushHistory }
