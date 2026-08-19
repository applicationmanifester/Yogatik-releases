// The floating companion: a small always-on-top window that stays with the user
// while they work in other applications.
//
// It loads the SAME renderer as the main window with ?companion=1, which is the
// whole trick: same origin means it shares IndexedDB, the API keys, the agent
// loop and all 65 tools. A separate mini-app would have had to duplicate every
// one of those and would drift from the real one immediately.
//
// Frameless and transparent, so the UI can draw its own rounded shell; the drag
// region is declared in CSS (-webkit-app-region), not here.

const { BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

const SIZE = { width: 380, height: 560, minWidth: 300, minHeight: 180 }

let win = null
let isDev = false
let onEvent = () => {}

function targetUrl() {
  if (isDev) return 'http://localhost:5173/?companion=1'
  return {
    file: path.join(__dirname, '..', 'dist-electron', 'index.html'),
    options: { query: { companion: '1' } },
  }
}

/** Bottom-right of the CURRENT display, inset, so it never lands off-screen. */
function defaultPosition() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  return {
    x: Math.round(workArea.x + workArea.width - SIZE.width - 24),
    y: Math.round(workArea.y + workArea.height - SIZE.height - 24),
  }
}

function create() {
  if (win && !win.isDestroyed()) return win
  const pos = defaultPosition()
  win = new BrowserWindow({
    ...SIZE,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,      // it is an accessory, not a second app in the switcher
    fullscreenable: false,
    maximizable: false,
    title: 'Yogatik Companion',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Float above full-screen apps too, which plain alwaysOnTop does not cover.
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const t = targetUrl()
  if (typeof t === 'string') win.loadURL(t)
  else win.loadFile(t.file, t.options)

  // Closing hides: the companion is summoned by a hotkey, so destroying it would
  // make the next summon pay a full renderer boot.
  win.on('close', (e) => {
    if (win && !win.__reallyClose) { e.preventDefault(); win.hide() }
  })
  win.on('closed', () => { win = null })
  return win
}

function show() {
  const w = create()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  onEvent('shown')
  return true
}

function hide() {
  if (win && !win.isDestroyed()) { win.hide(); onEvent('hidden') }
  return true
}

function toggle() {
  if (win && !win.isDestroyed() && win.isVisible()) return hide()
  return show()
}

function destroy() {
  if (win && !win.isDestroyed()) { win.__reallyClose = true; win.destroy() }
  win = null
}

function getWindow() { return (win && !win.isDestroyed()) ? win : null }

function registerCompanion({ dev = false, onCompanionEvent } = {}) {
  isDev = !!dev
  if (typeof onCompanionEvent === 'function') onEvent = onCompanionEvent

  ipcMain.handle('companion:toggle', () => ({ success: true, visible: toggle() }))
  ipcMain.handle('companion:show', () => ({ success: true, visible: show() }))
  ipcMain.handle('companion:hide', () => ({ success: true, visible: !hide() }))
  ipcMain.handle('companion:close', () => { hide(); return { success: true } })

  // The UI knows how tall its own content is; the window should follow it rather
  // than leaving a transparent dead zone under a collapsed companion.
  ipcMain.handle('companion:resize', (_e, p = {}) => {
    const w = getWindow()
    if (!w) return { success: false }
    const height = Math.max(SIZE.minHeight, Math.min(900, Math.round(p.height || SIZE.height)))
    const width = Math.max(SIZE.minWidth, Math.min(700, Math.round(p.width || w.getBounds().width)))
    const b = w.getBounds()
    // Grow upward from the bottom edge so a bottom-docked companion stays put.
    w.setBounds({ x: b.x, y: Math.max(0, b.y + (b.height - height)), width, height })
    return { success: true, width, height }
  })

  ipcMain.handle('companion:set-always-on-top', (_e, p = {}) => {
    const w = getWindow()
    if (!w) return { success: false }
    w.setAlwaysOnTop(!!p.on, 'floating')
    return { success: true, on: !!p.on }
  })
}

module.exports = { registerCompanion, show, hide, toggle, destroy, getWindow }
