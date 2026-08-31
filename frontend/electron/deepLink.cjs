/**
 * yogatik:// deep links, and the recent-files list.
 *
 * A protocol handler is easy to half-implement, because a URL reaches an
 * Electron app by THREE different routes and which one fires depends on the OS
 * and on whether the app was already running:
 *
 *   1. macOS, any launch state        → app.on('open-url')
 *   2. Windows/Linux, already running → app.on('second-instance'), in argv
 *   3. Windows/Linux, COLD start      → process.argv of this very process
 *
 * Handling only (1) is the classic mistake: it works perfectly on the
 * developer's Mac and does nothing on the platform this app actually ships to.
 * The cold-start case is the other half — the window does not exist yet, so the
 * URL has to be PARKED and replayed once the renderer is listening, or the very
 * first deep link a user ever follows is silently dropped.
 */
const { app, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { safeSend } = require('./safeWindow.cjs')

const PROTOCOL = 'yogatik'
const RECENT_FILE = 'recent-files.json'
const MAX_RECENT = 12

let getWindow = () => null
let pending = null      // a URL that arrived before the renderer could hear it
let rendererReady = false

/** Parse `yogatik://open?chat=123` into something the renderer can act on. */
function parseDeepLink(raw) {
  const url = String(raw || '')
  if (!url.toLowerCase().startsWith(`${PROTOCOL}://`)) return null
  let u
  try { u = new URL(url) } catch { return null }
  // In `yogatik://open?chat=1` the "host" is the action. Some platforms hand
  // over `yogatik:///open?...` instead, where it lands in the pathname.
  const action = (u.hostname || u.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase()
  if (!action) return null
  const params = Object.fromEntries(u.searchParams.entries())
  return { action, params }
}

/** Pull the first yogatik:// argument out of an argv array. */
function urlFromArgv(argv = []) {
  return argv.find(a => typeof a === 'string' && a.toLowerCase().startsWith(`${PROTOCOL}://`)) || null
}

function deliver(raw) {
  const link = parseDeepLink(raw)
  if (!link) return false
  const win = getWindow()
  if (win) {
    try {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } catch { /* the window may be going away; the send below reports it */ }
  }
  // Park it if the renderer is not listening yet. Delivering into the void is
  // how a cold-start deep link disappears with no error anywhere.
  if (!rendererReady || !safeSend(win, 'deep-link', link)) {
    pending = link
    return false
  }
  return true
}

// ── recent files ────────────────────────────────────────────────────────────
function recentPath() { return path.join(app.getPath('userData'), RECENT_FILE) }

function readRecent() {
  try {
    const list = JSON.parse(fs.readFileSync(recentPath(), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch { return [] }   // absent or corrupt is simply "no history"
}

function writeRecent(list) {
  try { fs.writeFileSync(recentPath(), JSON.stringify(list, null, 2)) } catch { /* not worth failing over */ }
}

/**
 * Record a file the user opened. Entries are de-duplicated by path and the
 * newest wins, so re-opening a file moves it to the top rather than adding a
 * second row for the same thing.
 */
function addRecent(filePath) {
  const p = String(filePath || '')
  if (!p) return readRecent()
  const list = readRecent().filter(r => r.path !== p)
  list.unshift({ path: p, name: path.basename(p), at: Date.now() })
  const next = list.slice(0, MAX_RECENT)
  writeRecent(next)
  return next
}

/**
 * The list, with entries whose file has since been deleted or moved marked
 * `missing` rather than dropped — a menu that silently loses an entry looks
 * like a bug, while "missing" tells the user what happened.
 */
function listRecent() {
  return readRecent().map(r => ({ ...r, missing: !fs.existsSync(r.path) }))
}

function clearRecent() { writeRecent([]); return [] }

function registerDeepLink(opts = {}) {
  getWindow = opts.getWindow || (() => null)

  // Claim the protocol. In development the executable is Electron itself, so
  // the path and an explicit argv have to be passed or Windows registers the
  // wrong command and every link opens a blank Electron instead.
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL)
    }
  } catch { /* an OS that refuses the registration still runs the app */ }

  // (1) macOS.
  app.on('open-url', (event, url) => { event.preventDefault(); deliver(url) })

  // (3) Windows/Linux cold start: the URL is already in our own argv.
  const cold = urlFromArgv(process.argv)
  if (cold) pending = parseDeepLink(cold)

  // The renderer tells us when it can actually receive one, and collects
  // whatever arrived before it was listening.
  ipcMain.handle('deeplink:ready', () => {
    rendererReady = true
    const p = pending
    pending = null
    return p
  })

  ipcMain.handle('recent:list', () => listRecent())
  ipcMain.handle('recent:add', (_e, { path: p } = {}) => addRecent(p))
  ipcMain.handle('recent:clear', () => clearRecent())
}

/** (2) Windows/Linux, app already running — called from the second-instance hook. */
function handleSecondInstance(argv = []) {
  const url = urlFromArgv(argv)
  if (url) deliver(url)
  return !!url
}

module.exports = {
  registerDeepLink, handleSecondInstance,
  parseDeepLink, urlFromArgv, addRecent, listRecent, clearRecent,
  PROTOCOL, MAX_RECENT,
}
