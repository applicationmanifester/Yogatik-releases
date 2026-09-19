// Yogatik Browser — Standalone Electron main process.
//
// This is the BROWSER-ONLY entry point. It does NOT load:
//   - Terminal sessions, MCP stdio, ollama daemon, comfy workflows
//   - Sub-agent runners, companion windows, cast control
//   - File system bridges, git integration, code editors
//
// It initializes:
//   - A single BrowserWindow with the browser chrome
//   - Tab management via browserControl.cjs
//   - Ad/tracker blocking via adBlocker.cjs
//   - Window state persistence
//   - CSP security headers

const { app, BrowserWindow, globalShortcut, ipcMain, shell, session: electronSession } = require('electron')
const path = require('path')

const { enableAdBlocker } = require('./adBlocker.cjs')
const { registerBrowserControl, destroyAllSessions } = require('./browserControl.cjs')

// ── App Identity ──────────────────────────────────────────────────────────
app.setName('Yogatik Browser')

// Isolated user data — never share cookies/state with Yogatik Studio
const BROWSER_DATA = path.join(app.getPath('appData'), 'YogatikBrowser')
app.setPath('userData', BROWSER_DATA)

// ── Single Instance Lock ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); return }

// ── Window State Persistence ──────────────────────────────────────────────
const fs = require('fs')
const STATE_FILE = path.join(BROWSER_DATA, 'window-state.json')

function loadWindowState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch { return null }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const maximized = win.isMaximized()
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify({ bounds, maximized }))
  } catch {}
}

// ── Splash Screen ─────────────────────────────────────────────────────────
let splashWin = null

function showSplash() {
  splashWin = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  splashWin.loadFile(path.join(__dirname, 'assets', 'splash.html'))
  splashWin.center()
}

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.close()
  }
  splashWin = null
}

// ── Main Browser Window ───────────────────────────────────────────────────
let mainWin = null

function createMainWindow() {
  const saved = loadWindowState()
const opts = {
    width: saved?.bounds?.width || 1200,
    height: saved?.bounds?.height || 850,
    x: saved?.bounds?.x,
    y: saved?.bounds?.y,
    show: false,
    title: 'Yogatik Browser',
    backgroundColor: '#0a0e14',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'browserWindowPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableSiteIsolation: true,
    },
  };

  mainWin = new BrowserWindow(opts)

  if (saved?.maximized) mainWin.maximize()

  mainWin.loadFile(path.join(__dirname, 'browserWindow.html'))

  mainWin.webContents.on('did-finish-load', () => {
    closeSplash()
    mainWin.show()
    // Open initial tab with Yogatik Browser new tab experience
    setTimeout(() => {
      ipcMain.emit('browser:quick-action', null, { action: 'new-tab' })
    }, 50)
  })

  // Persist window state on move/resize
  const debounceSave = (() => {
    let timer
    return () => {
      clearTimeout(timer)
      timer = setTimeout(() => saveWindowState(mainWin), 300)
    }
  })()
  mainWin.on('resize', debounceSave)
  mainWin.on('move', debounceSave)
  mainWin.on('maximize', debounceSave)
  mainWin.on('unmaximize', debounceSave)

  mainWin.on('closed', () => {
    mainWin = null
  })

  return mainWin
}

// ── Security: CSP Headers & Permission Hardening ─────────────────────────
function applyCSP() {
  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || ''
    const isChrome = (url.startsWith('file://') || url.startsWith('yogatik://')) &&
      (url.includes('browserWindow.html') || url.includes('newtab.html') || url.includes('splash.html'))

    if (isChrome) {
const csp = [
         "default-src 'self'",
         "script-src 'self' https:",
         "style-src 'self' 'unsafe-inline'",
         "img-src 'self' data: blob: https:",
         "font-src 'self' data:",
         "connect-src 'self' https: wss:",
         "frame-src 'none'",
         "object-src 'none'",
         "base-uri 'none'",
         "form-action 'none'",
       ].join(' ')

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
          'X-Content-Type-Options': ['nosniff'],
          'X-Frame-Options': ['DENY'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
          'Permissions-Policy': ['camera=(), microphone=(), geolocation=()'],
        },
      })
      return
    }

    // For user web content (external sites like YouTube, GitHub, Wikipedia):
    // Do NOT inject strict application CSP that blocks site assets, Polymer, or video streams.
    // Ensure standard baseline security headers are preserved.
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
      },
    })
  })
}

function setupPermissionHandler() {
  electronSession.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents ? webContents.getURL() : ''
    const isInternal = url.startsWith('file:') || url.startsWith('yogatik:') || url.startsWith('http://localhost')

    // Internal app chrome permissions can be granted
    if (isInternal) {
      callback(true)
      return
    }

    // Auto-deny sensitive device and privacy permissions on untrusted external origins
    const sensitive = [
      'camera',
      'microphone',
      'geolocation',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'mediaKeySystem',
      'screen-wake-lock',
      'midi',
      'openExternal',
    ]

    if (sensitive.includes(permission)) {
      callback(false)
      return
    }

    // Safe default for others
    callback(false)
  })
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────
function registerShortcuts() {
  // These are window-level shortcuts, not global
  if (!mainWin) return

  mainWin.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrl = input.control || input.meta

    // Ctrl+T: New Tab
    if (ctrl && input.key === 't') {
      ipcMain.emit('browser:quick-action', null, { action: 'new-tab' })
    }
    // Ctrl+W: Close Tab
    if (ctrl && input.key === 'w') {
      ipcMain.emit('browser:quick-action', null, { action: 'close-active' })
    }
    // Ctrl+L: Focus Address Bar
    if (ctrl && input.key === 'l') {
      mainWin.webContents.executeJavaScript(
        'document.getElementById("addr")?.focus(); document.getElementById("addr")?.select()'
      ).catch(() => {})
    }
    // Ctrl+K: Command Palette
    if (ctrl && input.key === 'k') {
      mainWin.webContents.executeJavaScript(
        'window.__toggleCommandPalette && window.__toggleCommandPalette()'
      ).catch(() => {})
    }
    // Ctrl+Shift+R: Reader Mode
    if (ctrl && input.shift && input.key === 'R') {
      ipcMain.emit('browser:quick-action', null, { action: 'toggle-reader' })
    }
    // F5: Reload
    if (input.key === 'F5') {
      ipcMain.emit('browser:quick-action', null, { action: 'reload' })
    }
    // Ctrl+F: Find
    if (ctrl && input.key === 'f') {
      mainWin.webContents.executeJavaScript(
        'window.__openFind && window.__openFind()'
      ).catch(() => {})
    }
    // Ctrl+D: Bookmark
    if (ctrl && input.key === 'd') {
      mainWin.webContents.executeJavaScript(
        'window.__toggleBookmark && window.__toggleBookmark()'
      ).catch(() => {})
    }
    // Ctrl+Shift+S: Screenshot
    if (ctrl && input.shift && input.key === 'S') {
      ipcMain.emit('browser:quick-action', null, { action: 'screenshot' })
    }
  })
}

// ── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Show splash while loading
  showSplash()

  // Enable ad/tracker blocking
  enableAdBlocker()

  // Apply security headers & permission hardening
  applyCSP()
  setupPermissionHandler()

  // Register browser IPC handlers
  registerBrowserControl(ipcMain, () => mainWin)

  // Create the main browser window
  createMainWindow()
  registerShortcuts()

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (!mainWin) {
      createMainWindow()
      registerShortcuts()
    }
  })
})

// Second instance: focus existing window
app.on('second-instance', () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore()
    mainWin.focus()
  }
})

app.on('window-all-closed', () => {
  destroyAllSessions()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (mainWin) saveWindowState(mainWin)
  destroyAllSessions()
})
