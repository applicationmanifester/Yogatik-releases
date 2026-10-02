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

const { app, BrowserWindow, globalShortcut, Notification, ipcMain, shell, session: electronSession } = require('electron')
const path = require('path')

const { enableAdBlocker } = require('./adBlocker.cjs')
const { registerBrowserControl, destroyAllSessions, restoreSavedSession, sessions, toggleSplitView, ensureSession, createTab, showActive } = require('./browserControl.cjs')
const { get: getSetting } = require('./settings/store.cjs')
const { loadChromeExtensions } = require('./extensions.cjs')

// ── App Identity ──────────────────────────────────────────────────────────
app.setName('Yogatik Browser')

if (process.platform === 'win32') {
  const appId = 'app.yogatik.browser'
  app.setAppUserModelId(appId)

  if (!app.isPackaged && process.env.APPDATA) {
    try {
      const iconPath = path.join(__dirname, 'assets', 'icon.ico')
      const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      const shortcutPath = path.join(startMenuDir, 'Yogatik Browser.lnk')
      shell.writeShortcutLink(shortcutPath, 'create', {
        target: process.execPath,
        args: `"${path.resolve(__dirname, '..')}"`,
        appUserModelId: appId,
        icon: iconPath,
        iconIndex: 0,
        description: 'Yogatik Browser',
      })
    } catch {}
  }
}

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

// ── Auto-Updates (electron-updater) ───────────────────────────────────────
// The GitHub publish config in package.json generates app-update.yml at
// packaging time; electron-updater reads it and polls the 'browser' channel.
// Downloads run silently in the background and install on quit — the user
// is only ever interrupted by a single notification that a restart is due.
let updaterStarted = false

function startAutoUpdater() {
  if (updaterStarted) return
  // electron-updater is only meaningful in a packaged build (app-update.yml
  // does not exist in dev, and checking would just 404).
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-downloaded', (info) => {
      try {
        new Notification({
          title: 'Yogatik Browser — Update Ready',
          body: `Version ${info.version} downloaded. It installs next time you restart.`,
          icon: path.join(__dirname, 'assets', 'icon.png'),
          silent: true,
        }).show()
      } catch {}
    })

    autoUpdater.on('error', () => { /* offline / no release — stay silent */ })

    // First check shortly after launch (after the window is up), then every 4h.
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15_000)
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
    updaterStarted = true
  } catch (err) {
    console.warn('[updater] electron-updater unavailable:', err.message)
  }
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
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
    // Restore the previous session's tabs (urls, titles, active tab, pinned
    // state). Falls back to a fresh new tab when nothing was saved.
    setTimeout(() => {
      const s = ensureSession('__default__', 'window')
      s.win = mainWin
      const restored = restoreSavedSession(() => mainWin)
      if (!restored || !s.tabs.size) {
        const id = createTab(s, null)
        s.activeTabId = id
        showActive(s)
      }
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
// Network privacy: DNS-over-HTTPS (encrypted resolution — the ISP can no
// longer see or poison domain lookups) and HTTPS-only mode (every plain
// http:// request is transparently upgraded; localhost stays exempt).

function applyNetworkPrivacy() {
  // DNS-over-HTTPS via Chromium's DnsOverHttps feature. Quad9 (Switzerland,
  // no-logs) is the privacy default; Cloudflare as the fallback template.
  if (getSetting('dnsOverHttps') !== false) {
    try {
      app.commandLine.appendSwitch('enable-features', 'DnsOverHttps')
      app.commandLine.appendSwitch(
        'dns-over-https-templates',
        getSetting('dohTemplate') || 'https://dns.quad9.net/dns-query https://cloudflare-dns.com/dns-query'
      )
    } catch {}
  }

  // HTTPS-only mode: redirect http:// → https:// at the request layer.
  electronSession.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*'] },
    (details, cb) => {
      const url = details.url || ''
      try {
        const u = new URL(url)
        // localhost / LAN / anything that is not a public http host stays.
        const isLocal = u.hostname === 'localhost' ||
          u.hostname === '127.0.0.1' || u.hostname === '::1' ||
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)
        if (isLocal || u.pathname === '/favicon.ico') { cb({ cancel: false }); return }
        // Upgrading is a redirect — safe for idempotent GETs; POSTs to http
        // endpoints are rare and a broken https endpoint would fail loudly.
        cb({ redirectURL: 'https://' + u.host + u.pathname + u.search })
      } catch {
        cb({ cancel: false })
      }
    }
  )
}

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

    // Per-site exceptions: the user may have explicitly granted this
    // permission for this origin via the Site Permissions panel (persisted
    // in settings.json as sitePermissions["https://host"][permission]).
    try {
      const origin = new URL(url).origin
      const grants = getSetting('sitePermissions')
      if (grants && typeof grants === 'object' && grants[origin]?.[permission] === true) {
        callback(true)
        return
      }
    } catch {}

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
    // Ctrl+Tab / Ctrl+Shift+Tab: cycle tabs (next / previous)
    if (ctrl && input.key === 'Tab') {
      ipcMain.emit('browser:quick-action', null, {
        action: input.shift ? 'cycle-tab-prev' : 'cycle-tab-next',
      })
      event.preventDefault()
    }
    // Ctrl+Shift+T: Reopen last closed tab
    if (ctrl && input.shift && input.key === 'T') {
      ipcMain.emit('browser:quick-action', null, { action: 'reopen-tab' })
      event.preventDefault()
    }
    // Ctrl+\: Split View
    if (ctrl && input.key === '\\') {
      const s = [...sessions.values()].find(x => x.win === mainWin)
      if (s) toggleSplitView(s)
      event.preventDefault()
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

  // Load unpacked Chrome extensions from <userData>/chrome-extensions/
  loadChromeExtensions(electronSession.defaultSession)

  // Apply security headers & permission hardening
  applyCSP()
  setupPermissionHandler()
  applyNetworkPrivacy()

  // Register browser IPC handlers
  registerBrowserControl(ipcMain, () => mainWin)

  // Create the main browser window
  createMainWindow()
  registerShortcuts()

  // Start background update checks (packaged builds only)
  startAutoUpdater()

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
  // Stop page monitors and their hidden view.
  try { require('./pageMonitor.cjs').destroyMonitors() } catch {}
})
