// Dedicated Desktop Windows for Extensions & Power Tools
// Allows Media Studio, Stock Trading, Torrent Downloader, and Domain Hub
// to operate in their own native desktop windows with remembered bounds,
// multi-monitor safety, dark framing, and native controls.

const { BrowserWindow, ipcMain, screen, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { safeSend } = require('./safeWindow.cjs')

const TOOL_CONFIGS = {
  media_studio: {
    title: 'Yogatik Creative Media Studio (Kling 3, Seedance, Wan, Soul & Flux)',
    queryKey: 'media_studio',
    defaultSize: { width: 1300, height: 860, minWidth: 980, minHeight: 650 },
    boundsFile: 'media-studio-window.json',
  },
  stock_trading: {
    title: 'Yogatik Stock Trading Terminal (NSE / BSE & Paper Trading)',
    queryKey: 'stock_trading',
    defaultSize: { width: 1320, height: 880, minWidth: 1000, minHeight: 680 },
    boundsFile: 'trading-terminal-window.json',
  },
  torrent_downloader: {
    title: 'Yogatik Torrent Downloader (High-Speed P2P Client)',
    queryKey: 'torrent_downloader',
    defaultSize: { width: 1100, height: 780, minWidth: 800, minHeight: 550 },
    boundsFile: 'torrent-downloader-window.json',
  },
  domain_hub: {
    title: 'Yogatik Domain & Social Intelligence Hub (YouTube, X, Jobs, Trends)',
    queryKey: 'domain_hub',
    defaultSize: { width: 1150, height: 820, minWidth: 850, minHeight: 600 },
    boundsFile: 'domain-hub-window.json',
  },
}

function getBoundsFilePath(fileName) {
  return path.join(app.getPath('userData'), fileName)
}

function savedBounds(boundsFileName, defaultSize) {
  try {
    const s = JSON.parse(fs.readFileSync(getBoundsFilePath(boundsFileName), 'utf8'))
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.width) || !Number.isFinite(s.height)) return null
    const area = screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height }).workArea
    const onScreen = s.x < area.x + area.width && s.x + 80 > area.x
      && s.y < area.y + area.height && s.y + 40 > area.y
    if (!onScreen) return null
    return {
      x: Math.round(s.x),
      y: Math.round(s.y),
      width: Math.max(defaultSize.minWidth, Math.round(s.width)),
      height: Math.max(defaultSize.minHeight, Math.round(s.height)),
    }
  } catch {
    return null
  }
}

function trackBounds(w, boundsFileName) {
  let t = null
  const save = () => {
    clearTimeout(t)
    t = setTimeout(() => {
      try {
        if (!w || w.isDestroyed() || w.isMinimized() || w.isMaximized()) return
        const b = w.getBounds()
        fs.writeFileSync(getBoundsFilePath(boundsFileName), JSON.stringify(b))
      } catch {}
    }, 400)
  }
  w.on('move', save)
  w.on('resize', save)
}

const openWindows = new Map()
let isDevMode = false
let mainWindowGetter = null

function getToolWindow(toolId) {
  const w = openWindows.get(toolId)
  return (w && !w.isDestroyed()) ? w : null
}

function createToolWindow(toolId, params = {}) {
  const cfg = TOOL_CONFIGS[toolId]
  if (!cfg) {
    console.warn(`[toolWindows] Unknown toolId requested: ${toolId}`)
    return null
  }

  const existing = openWindows.get(toolId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    if (params && Object.keys(params).length > 0) {
      safeSend(existing, `${toolId}:params`, params)
    }
    return existing
  }

  const remembered = savedBounds(cfg.boundsFile, cfg.defaultSize)
  const iconPath = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png')

  const win = new BrowserWindow({
    ...cfg.defaultSize,
    ...(remembered || {}),
    show: false,
    frame: true,
    title: cfg.title,
    backgroundColor: '#0a0e14',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      additionalArguments: [
        `--yogatik-window-type=${toolId}`,
        `--yogatik-window-params=${encodeURIComponent(JSON.stringify(params || {}))}`,
      ],
    },
  })

  openWindows.set(toolId, win)

  const query = new URLSearchParams()
  query.set(cfg.queryKey, '1')
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && typeof v !== 'object') {
        query.set(k, String(v))
      }
    }
  }

  // Resolve best local bundle location (dist-electron is packaged; dist is fallback)
  const candidatePaths = [
    path.join(__dirname, '..', 'dist-electron', 'index.html'),
    path.join(app.getAppPath(), 'dist-electron', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
  ]
  const localBundlePath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0]

  let hasFallenBack = false
  const fallbackToLocal = () => {
    if (hasFallenBack || !win || win.isDestroyed()) return
    hasFallenBack = true
    console.log(`[toolWindows] Loading local file for ${toolId}: ${localBundlePath}`)
    win.loadFile(localBundlePath, {
      search: query.toString(),
      hash: query.toString(),
    }).catch(err => {
      console.error(`[toolWindows] Failed to load local file for ${toolId}:`, err)
    })
  }

  win.webContents.once('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[toolWindows] Load failed on ${validatedURL}: ${errorDescription} (${errorCode}). Falling back to local file.`)
    fallbackToLocal()
  })

  // Detect dev server origin dynamically from active mainWindow if available
  const mainWin = typeof mainWindowGetter === 'function' ? mainWindowGetter() : null
  const mainUrl = (mainWin && !mainWin.isDestroyed()) ? (mainWin.webContents?.getURL() || '') : ''

  if (mainUrl.startsWith('http://') || mainUrl.startsWith('https://')) {
    try {
      const u = new URL(mainUrl)
      const targetUrl = `${u.origin}/?${query.toString()}#${query.toString()}`
      win.loadURL(targetUrl).catch(() => fallbackToLocal())
    } catch {
      fallbackToLocal()
    }
  } else if (isDevMode) {
    win.loadURL(`http://localhost:5173/?${query.toString()}#${query.toString()}`).catch(() => fallbackToLocal())
  } else {
    fallbackToLocal()
  }

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show()
  })

  win.on('closed', () => {
    openWindows.delete(toolId)
  })

  trackBounds(win, cfg.boundsFile)
  return win
}

function closeToolWindow(toolId) {
  const win = openWindows.get(toolId)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  openWindows.delete(toolId)
  return true
}

function isToolWindowOpen(toolId) {
  const win = openWindows.get(toolId)
  return !!(win && !win.isDestroyed() && win.isVisible())
}

function destroyAllToolWindows() {
  for (const [id, win] of openWindows.entries()) {
    try {
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
    } catch {}
  }
  openWindows.clear()
}

function registerToolWindowsIpc({ dev = false, getMainWindow = null } = {}) {
  isDevMode = !!dev
  if (typeof getMainWindow === 'function') {
    mainWindowGetter = getMainWindow
  }

  // Generic tool window opener & query
  ipcMain.handle('tool-window:open', (_e, { toolId, params = {} } = {}) => {
    const w = createToolWindow(toolId, params)
    return { success: true, isOpened: !!w }
  })

  ipcMain.handle('tool-window:close', (_e, { toolId } = {}) => {
    return { success: closeToolWindow(toolId) }
  })

  ipcMain.handle('tool-window:is-open', (_e, { toolId } = {}) => {
    return { isOpen: isToolWindowOpen(toolId) }
  })

  // Specific convenience handlers for tools
  ipcMain.handle('media-studio:open', (_e, params = {}) => {
    const w = createToolWindow('media_studio', params)
    return { success: true, isOpened: !!w }
  })
  ipcMain.handle('media-studio:close', () => {
    return { success: closeToolWindow('media_studio') }
  })
  ipcMain.handle('media-studio:is-open', () => {
    return { isOpen: isToolWindowOpen('media_studio') }
  })

  ipcMain.handle('trading-terminal:open', (_e, params = {}) => {
    const w = createToolWindow('stock_trading', params)
    return { success: true, isOpened: !!w }
  })
  ipcMain.handle('trading-terminal:close', () => {
    return { success: closeToolWindow('stock_trading') }
  })
  ipcMain.handle('trading-terminal:is-open', () => {
    return { isOpen: isToolWindowOpen('stock_trading') }
  })

  ipcMain.handle('torrent-downloader:open', (_e, params = {}) => {
    const w = createToolWindow('torrent_downloader', params)
    return { success: true, isOpened: !!w }
  })
  ipcMain.handle('torrent-downloader:close', () => {
    return { success: closeToolWindow('torrent_downloader') }
  })
  ipcMain.handle('torrent-downloader:is-open', () => {
    return { isOpen: isToolWindowOpen('torrent_downloader') }
  })

  ipcMain.handle('domain-hub:open', (_e, params = {}) => {
    const w = createToolWindow('domain_hub', params)
    return { success: true, isOpened: !!w }
  })
  ipcMain.handle('domain-hub:close', () => {
    return { success: closeToolWindow('domain_hub') }
  })
  ipcMain.handle('domain-hub:is-open', () => {
    return { isOpen: isToolWindowOpen('domain_hub') }
  })

  // Bridge to forward AI queries / prompts from tool windows (like Domain Hub) back into the main chat window
  ipcMain.handle('desktop:send-prompt-to-main', (_e, { prompt } = {}) => {
    const main = typeof mainWindowGetter === 'function' ? mainWindowGetter() : null
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
      safeSend(main, 'desktop:execute-prompt', { prompt })
      return { success: true }
    }
    return { success: false, reason: 'main_window_unavailable' }
  })
}

module.exports = {
  createToolWindow,
  closeToolWindow,
  isToolWindowOpen,
  getToolWindow,
  destroyAllToolWindows,
  registerToolWindowsIpc,
  TOOL_CONFIGS,
}
