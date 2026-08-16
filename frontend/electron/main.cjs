// Yogatik — Electron main process (thin orchestrator).
// Wraps the same Vite build as the web app and wires the desktop-native modules:
//   fsBridge   — scoped local-file IPC (mirrors the Tauri commands)
//   cors       — direct provider calls without a browser proxy
//   menu       — native app menu + shortcuts
//   windowState— remember size/position between launches

const { app, BrowserWindow, shell, globalShortcut, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const { registerFsBridge, initJournal } = require('./fsBridge.cjs')
const { registerRootsIpc, rootPathsFor, resolvePath } = require('./roots.cjs')
const { enableProviderCors } = require('./cors.cjs')
const { buildMenu } = require('./menu.cjs')
const { createTray } = require('./tray.cjs')
const { registerNotifications } = require('./notify.cjs')
const { initAutoUpdate, checkForUpdates } = require('./updater.cjs')
const { startScheduler, stopScheduler, registerSchedulerIPC } = require('./scheduler.cjs')
const { registerSubAgentIPC } = require('./subAgentRunner.cjs')
const windowState = require('./windowState.cjs')

const isDev = !app.isPackaged
let mainWindow = null

// Windows needs an explicit AppUserModelID for notifications to display.
app.setAppUserModelId('app.yogatik.desktop')

function createWindow() {
  const state = windowState.restore({ width: 1200, height: 820 })

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 560,
    show: false,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0a0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (state.maximized) mainWindow.maximize()
  windowState.track(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-electron', 'index.html'))
  }

  // External links open in the user's browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })

  // Closing hides to the tray (background) instead of quitting; real quit sets
  // app.isQuitting (tray menu / Cmd+Q).
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() }
  })

  // The native menu has no chat context, so it shows the global default folder.
  buildMenu(mainWindow, {
    getRoot: () => rootPathsFor({})[0] || null,
    onCheckUpdates: () => checkForUpdates(() => mainWindow),
  })
}

// Single instance: focus the existing window on a second launch.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  const getWindow = () => mainWindow

  let searchSidecar = null
  let searchPort = null

  function startSearchSidecar() {
    const binName = process.platform === 'win32' ? 'search-sidecar.exe' : 'search-sidecar'
    const binPath = path.join(process.resourcesPath, binName)

    return new Promise((resolve, reject) => {
      const child = spawn(binPath, ['--port=0'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
        const match = output.match(/PORT=(\d+)/)
        if (match) {
          searchPort = parseInt(match[1], 10)
          log(`Search sidecar started on port ${searchPort}`)
          resolve()
        }
      })

      child.stderr.on('data', (data) => {
        log(`[search-sidecar] ${data}`)
      })

      child.on('error', (err) => {
        log(`Failed to start search sidecar: ${err.message}`)
        reject(err)
      })

      child.on('exit', (code) => {
        if (searchSidecar === child) {
          searchSidecar = null
          searchPort = null
          log(`Search sidecar exited with code ${code}`)
        }
      })

      searchSidecar = child

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!searchPort) {
          child.kill()
          reject(new Error('Search sidecar startup timeout'))
        }
      }, 10000)
    })
  }

  function log(msg) {
    console.log(`[main] ${msg}`)
  }

  app.whenReady().then(async () => {
    enableProviderCors()
    // Roots first: it loads the state fsBridge resolves every path against.
    registerRootsIpc({ getWindow })
    // Undo journal for file mutations; lives beside the roots registry.
    initJournal(path.join(app.getPath('userData'), 'yogatik-journal'))
    registerFsBridge()
    registerNotifications(getWindow)
    registerSchedulerIPC({ getWindow })
    registerSubAgentIPC()
    startScheduler()
    createWindow()
    createTray(getWindow)
    initAutoUpdate(getWindow)

    // Start local search sidecar
    try {
      await startSearchSidecar()
    } catch (err) {
      log(`Search sidecar unavailable: ${err.message}`)
    }

    // IPC for local search
    ipcMain.handle('local-search', async (_, query, options = {}) => {
      if (!searchPort) {
        throw new Error('Search sidecar not running')
      }
      const params = new URLSearchParams({
        q: query,
        count: String(options.count || 8),
        recency: options.recency || 'any',
        engines: options.engines || 'all',
      })
      if (options.site) params.set('site', options.site)

      const resp = await fetch(`http://127.0.0.1:${searchPort}/search?${params}`)
      if (!resp.ok) throw new Error(`Search failed: ${resp.status}`)
      return resp.json()
    })

    // IPC for desktop terminal shell command execution
    ipcMain.handle('terminal:exec', async (_, { ctx, command, cwd, timeout = 30000 }) => {
      // A folder must be bound to THIS chat — never fall back to the app's own
      // install directory (process.cwd()), and never run in another chat's folder.
      const roots = rootPathsFor(ctx)
      if (!roots.length) {
        return { success: false, exitCode: -1, stdout: '', stderr: 'No working folder for this chat. Ask the user to add one.', killed: false }
      }
      let workingDir
      try {
        workingDir = resolvePath(ctx, cwd || '.')
      } catch (e) {
        return { success: false, exitCode: -1, stdout: '', stderr: `Invalid working directory: ${e.message}`, killed: false }
      }

      return new Promise((resolve) => {
        const isWin = process.platform === 'win32'
        const shellCmd = isWin ? 'cmd.exe' : '/bin/sh'
        const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command]

        const proc = spawn(shellCmd, shellArgs, {
          cwd: workingDir,
          windowsHide: true,
          env: { ...process.env },
        })

        let stdout = ''
        let stderr = ''
        let killed = false

        const timer = setTimeout(() => {
          killed = true
          proc.kill()
        }, timeout)

        proc.stdout.on('data', (d) => { stdout += d.toString('utf8') })
        proc.stderr.on('data', (d) => { stderr += d.toString('utf8') })

        proc.on('close', (code) => {
          clearTimeout(timer)
          resolve({
            success: code === 0 && !killed,
            exitCode: code,
            stdout: stdout.slice(-100000), // Cap at 100KB
            stderr: stderr.slice(-50000),
            killed,
          })
        })

        proc.on('error', (err) => {
          clearTimeout(timer)
          resolve({
            success: false,
            exitCode: -1,
            stdout: '',
            stderr: err.message,
            killed: false,
          })
        })
      })
    })

    // Global show/focus hotkey (works even when the window is hidden to tray).
    globalShortcut.register('CommandOrControl+Shift+Y', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
      else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else if (mainWindow) mainWindow.show()
    })
  })

  app.on('before-quit', () => { app.isQuitting = true })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopScheduler()  // Stop the cron daemon gracefully
    if (searchSidecar) {
      searchSidecar.kill()
    }
  })

  // With a tray icon the app intentionally keeps running when all windows close.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && app.isQuitting) app.quit()
  })
}