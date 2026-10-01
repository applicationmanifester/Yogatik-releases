// Dedicated Video Studio & Precision Trimmer Window
// Allows the user to pop out the video studio into its own full desktop window
// with full multi-monitor support, resizable frame, always-on-top, and native window controls.

const { BrowserWindow, ipcMain, screen, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { safeSend } = require('./safeWindow.cjs')

const DEFAULT_SIZE = { width: 1280, height: 820, minWidth: 900, minHeight: 600 }

function boundsFile() {
  return path.join(app.getPath('userData'), 'video-studio-window.json')
}

function savedBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'))
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.width) || !Number.isFinite(s.height)) return null
    const area = screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height }).workArea
    const onScreen = s.x < area.x + area.width && s.x + 80 > area.x
      && s.y < area.y + area.height && s.y + 40 > area.y
    if (!onScreen) return null
    return {
      x: Math.round(s.x),
      y: Math.round(s.y),
      width: Math.max(DEFAULT_SIZE.minWidth, Math.round(s.width)),
      height: Math.max(DEFAULT_SIZE.minHeight, Math.round(s.height)),
    }
  } catch {
    return null
  }
}

function trackBounds(w) {
  let t = null
  const save = () => {
    clearTimeout(t)
    t = setTimeout(() => {
      try {
        if (!w || w.isDestroyed() || w.isMinimized() || w.isMaximized()) return
        const b = w.getBounds()
        fs.writeFileSync(boundsFile(), JSON.stringify(b))
      } catch {}
    }, 400)
  }
  w.on('move', save)
  w.on('resize', save)
}

let win = null
let isDev = false

function getWindow() {
  return (win && !win.isDestroyed()) ? win : null
}

function createVideoStudioWindow({ videoUrl = '', videoName = '', filePath = '' } = {}) {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (videoUrl || filePath) {
      safeSend(win, 'video-studio:load-media', { videoUrl, videoName, filePath })
    }
    return win
  }

  const remembered = savedBounds()
  const iconPath = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png')

  win = new BrowserWindow({
    ...DEFAULT_SIZE,
    ...(remembered || {}),
    show: false,
    frame: true,
    title: 'Yogatik Video Studio & Precision Trimmer',
    backgroundColor: '#0a0e14',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  const query = new URLSearchParams()
  query.set('video_studio', '1')
  if (videoUrl) query.set('video', videoUrl)
  if (videoName) query.set('name', videoName)
  if (filePath) query.set('path', filePath)

  if (isDev) {
    win.loadURL(`http://localhost:5173/?${query.toString()}`)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      search: query.toString(),
    })
  }

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show()
  })

  win.on('closed', () => {
    win = null
  })

  trackBounds(win)
  return win
}

function registerVideoStudioIpc({ dev = false } = {}) {
  isDev = !!dev

  ipcMain.handle('video-studio:open', (_e, params = {}) => {
    const w = createVideoStudioWindow(params)
    return { success: true, isOpened: !!w }
  })

  ipcMain.handle('video-studio:close', () => {
    if (win && !win.isDestroyed()) win.close()
    win = null
    return { success: true }
  })

  ipcMain.handle('video-studio:is-open', () => {
    return { isOpen: !!(win && !win.isDestroyed() && win.isVisible()) }
  })

  ipcMain.handle('video-studio:set-always-on-top', (_e, flag) => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(!!flag, 'floating')
      return { success: true, alwaysOnTop: !!flag }
    }
    return { success: false }
  })
}

module.exports = {
  createVideoStudioWindow,
  registerVideoStudioIpc,
  getVideoStudioWindow: getWindow,
}
