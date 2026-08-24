// Yogatik — Electron main process (thin orchestrator).
// Wraps the same Vite build as the web app and wires the desktop-native modules:
//   fsBridge   — scoped local-file IPC (mirrors the Tauri commands)
//   cors       — direct provider calls without a browser proxy
//   menu       — native app menu + shortcuts
//   windowState— remember size/position between launches

const { app, BrowserWindow, shell, globalShortcut, ipcMain, desktopCapturer, screen, clipboard } = require('electron')
const path = require('path')
const os = require('os')
const http = require('http')
const url = require('url')
const { spawn, exec } = require('child_process')

const { registerFsBridge, initJournal } = require('./fsBridge.cjs')
const { registerRootsIpc, rootPathsFor, resolvePath, getTrustState } = require('./roots.cjs')
const { enableProviderCors } = require('./cors.cjs')
const { buildMenu } = require('./menu.cjs')
const { createTray } = require('./tray.cjs')
const { registerNotifications } = require('./notify.cjs')
const { initAutoUpdate, checkForUpdates } = require('./updater.cjs')
const { startScheduler, stopScheduler, registerSchedulerIPC } = require('./scheduler.cjs')
const { registerSubAgentIPC } = require('./subAgentRunner.cjs')
const { registerKeychain } = require('./keychain.cjs')
const { registerClipboard, stopPolling } = require('./clipboardManager.cjs')
const { registerWatcher, stopAllWatchers } = require('./watcher.cjs')
const { registerPower } = require('./power.cjs')
const { registerDialogs } = require('./dialogs.cjs')
const { registerProcesses } = require('./processes.cjs')
const { registerPty, killAllPty } = require('./pty.cjs')
const { registerMcpStdio, killAllMcpStdio } = require('./mcpStdio.cjs')
const { registerCompanionInput } = require('./companionInput.cjs')
const { registerBrowserControl, destroyAllSessions } = require('./browserControl.cjs')
const { registerCompanion, toggle: toggleCompanion, destroy: destroyCompanion, isVisible: isCompanionVisible, sendToCompanion } = require('./companionWindow.cjs')
// Complementary modules from the per-chat-folders work. Different IPC channels
// (underscore-style) so they coexist with the colon-style ones above:
//   bgProcesses    — start/stream LONG-RUNNING commands (vs processes.cjs, which
//                    lists and kills OS processes)
//   mcpStdioClient — main-side MCP handshake + tools/call (vs mcpStdio.cjs, a
//                    lower-level RPC passthrough the renderer drives)
//   fsWatcher      — polling drain model (vs watcher.cjs's named watchers)
const { registerBgProcessIpc, killAllBgProcesses } = require('./bgProcesses.cjs')
const { registerGitIpc } = require('./git.cjs')
const { registerFsWatcherIpc, stopAllFsWatchers } = require('./fsWatcher.cjs')
const { registerMcpStdioClientIpc, stopAllMcpStdioClients } = require('./mcpStdioClient.cjs')
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

  // External links open in the user's default browser, not inside the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/^https?:/.test(url) && !url.startsWith('http://localhost:5173')) {
      event.preventDefault()
      shell.openExternal(url)
    }
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
      mainWindow.show()
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
    // Dev loop: background processes + hooks, git, file watching. All scoped to
    // the calling chat's bound roots by the same resolver the fs tools use.
    // ── The window comes FIRST ───────────────────────────────────────────────
    // Everything below this line registers IPC the RENDERER calls, and the
    // renderer cannot call anything until it has loaded — several hundred
    // milliseconds away. Doing all of it before createWindow() simply delayed
    // the window by the sum of its parts for no benefit whatsoever.
    //
    // Only the handlers the first paint genuinely depends on stay above:
    // roots (which fsBridge resolves every path against), the journal, and the
    // fs bridge itself, because the workspace chip reads them on mount.
    createWindow()

    // Registered on the next turn of the loop, so the window is already on
    // screen and painting while these run. They land long before the renderer
    // finishes loading its own bundle, which is what makes this safe.
    setImmediate(() => {
      registerBgProcessIpc({ rootPathsFor, resolvePath, getTrustState })
      registerGitIpc({ rootPathsFor })
      registerFsWatcherIpc({ rootPathsFor })
      registerMcpStdioClientIpc()
      registerNotifications(getWindow)
      registerSchedulerIPC({ getWindow })
      registerSubAgentIPC()
      // Desktop-only capability modules (safeStorage vault, clipboard history,
      // file watcher, power/idle, native dialogs, process manager, PTY).
      registerKeychain()
      registerClipboard(getWindow)
      registerWatcher(getWindow)
      registerPower(getWindow, { pauseScheduler: stopScheduler, resumeScheduler: startScheduler })
      registerDialogs(getWindow)
      registerProcesses()
      registerPty(getWindow)
      registerMcpStdio()
      registerCompanionInput()
      registerBrowserControl(getWindow)
      registerCompanion({ dev: isDev })
      startScheduler()
      createTray(getWindow, { onToggleCompanion: toggleCompanion })
      initAutoUpdate(getWindow)
    })

    // Start the local search sidecar WITHOUT awaiting it.
    //
    // Every ipcMain.handle below this point sat behind that await, so a slow or
    // hanging sidecar left desktop:getSystemInfo and the window controls
    // unregistered for as long as it took — the renderer would call them and
    // get "no handler" for a reason that had nothing to do with them. Nothing
    // here depends on the sidecar being up.
    startSearchSidecar().catch((err) => log(`Search sidecar unavailable: ${err.message}`))

    // Desktop system info & window controls
    ipcMain.handle('desktop:isAlwaysOnTop', () => {
      return mainWindow ? mainWindow.isAlwaysOnTop() : false
    })

    ipcMain.handle('desktop:toggleAlwaysOnTop', (_, flag) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false
      const current = mainWindow.isAlwaysOnTop()
      const next = flag !== undefined ? Boolean(flag) : !current
      mainWindow.setAlwaysOnTop(next)
      mainWindow.webContents.send('menu', { type: 'always-on-top-changed', value: next })
      return next
    })

    ipcMain.handle('desktop:getSystemInfo', () => {
      return {
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus()?.length || 1,
        cpuModel: os.cpus()?.[0]?.model || 'Unknown CPU',
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
      }
    })

    ipcMain.handle('desktop:showItemInFolder', async (_, p) => {
      if (!p) return false
      shell.showItemInFolder(path.normalize(p))
      return true
    })

    ipcMain.handle('desktop:openPath', async (_, p) => {
      if (!p) return false
      await shell.openPath(path.normalize(p))
      return true
    })

    ipcMain.handle('desktop:openExternal', async (_, url) => {
      if (!url) return false
      try {
        if (/^https?:/.test(url)) {
          await shell.openExternal(url)
          return true
        }
      } catch { /* ignore */ }
      return false
    })

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
    ipcMain.handle('terminal:exec', async (_, { ctx, command, cwd, timeout = 30000, env: extraEnv }) => {
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
          // Caller-supplied non-interactive flags (CI, PAGER, GIT_TERMINAL_PROMPT…)
          // were dropped here, so commands could still block on a prompt.
          env: { ...process.env, ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}) },
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

    // ─── AI Companion & Screen-Watcher IPC Handlers ───────────────────────────
    let preCompanionBounds = null
    let isCompanionActive = false

    // 1. Capture primary screen or target window for vision AI analysis
    ipcMain.handle('desktop:captureScreen', async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1920, height: 1080 },
        })
        const primary = sources.find(s => s.id.startsWith('screen:')) || sources[0]
        if (!primary) return { success: false, error: 'No screen source found' }
        const dataUrl = primary.thumbnail.toDataURL('image/jpeg', 85)
        return {
          success: true,
          name: primary.name,
          dataUrl,
          width: primary.thumbnail.getSize().width,
          height: primary.thumbnail.getSize().height,
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    // 2. Query the active foreground application & window title (Windows OS)
    ipcMain.handle('desktop:getActiveWindow', async () => {
      if (process.platform !== 'win32') {
        return { success: true, appName: 'Desktop App', title: 'Active Window' }
      }
      return new Promise((resolve) => {
        // PowerShell command to query the active foreground window
        const psScript = `
          $sig = @'
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
            [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
'@
          Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "Win32" -ErrorAction SilentlyContinue
          $hwnd = [Win32.Win32Util]::GetForegroundWindow()
          $sb = New-Object System.Text.StringBuilder 256
          [void][Win32.Win32Util]::GetWindowText($hwnd, $sb, 256)
          $pidVal = 0
          [void][Win32.Win32Util]::GetWindowThreadProcessId($hwnd, [ref]$pidVal)
          $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
          [PSCustomObject]@{
            appName = if ($proc) { $proc.ProcessName } else { "Unknown" }
            title   = $sb.ToString()
            pid     = $pidVal
          } | ConvertTo-Json -Compress
        `
        exec(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { timeout: 3000 }, (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve({ success: true, appName: 'External Application', title: 'Active Window' })
            return
          }
          try {
            const data = JSON.parse(stdout.trim())
            resolve({ success: true, appName: data.appName || 'Application', title: data.title || '', pid: data.pid })
          } catch {
            resolve({ success: true, appName: 'External App', title: stdout.trim() })
          }
        })
      })
    })

    // 3. Toggle Always-on-Top Floating Companion Mode (compact overlay widget)
    ipcMain.handle('desktop:setCompanionMode', async (_, enable) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false
      const next = enable !== undefined ? Boolean(enable) : !isCompanionActive
      if (next && !isCompanionActive) {
        preCompanionBounds = mainWindow.getBounds()
        isCompanionActive = true
        const primary = screen.getPrimaryDisplay()
        const workArea = primary.workArea
        const compWidth = 380
        const compHeight = 600
        mainWindow.setAlwaysOnTop(true, 'floating')
        mainWindow.setBounds({
          x: Math.round(workArea.x + workArea.width - compWidth - 20),
          y: Math.round(workArea.y + workArea.height - compHeight - 20),
          width: compWidth,
          height: compHeight,
        })
      } else if (!next && isCompanionActive) {
        isCompanionActive = false
        mainWindow.setAlwaysOnTop(false)
        if (preCompanionBounds) {
          mainWindow.setBounds(preCompanionBounds)
        } else {
          mainWindow.setSize(1200, 820)
          mainWindow.center()
        }
      }
      mainWindow.webContents.send('companion-mode-changed', isCompanionActive)
      return isCompanionActive
    })

    // 4. Perform synthetic action in target window or desktop (type, hotkey, open, clipboard)
    ipcMain.handle('desktop:executeAction', async (_, action) => {
      const { type, text, keys, targetUrl, targetApp } = action || {}
      try {
        if (type === 'type' && text) {
          // Send keystrokes via Windows Forms SendKeys
          const escaped = text.replace(/[{}+^%~()]/g, '{$&}')
          exec(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`)
          return { success: true, action: 'type', text }
        }
        if (type === 'hotkey' && keys) {
          exec(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`)
          return { success: true, action: 'hotkey', keys }
        }
        if (type === 'clipboard' && text) {
          clipboard.writeText(text)
          return { success: true, action: 'clipboard', length: text.length }
        }
        if (type === 'launch' && (targetUrl || targetApp)) {
          if (targetUrl) await shell.openExternal(targetUrl)
          else if (targetApp) await shell.openPath(targetApp)
          return { success: true, action: 'launch', target: targetUrl || targetApp }
        }
        return { success: false, error: `Unsupported action type: ${type}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    })

    // ─── Native Google OAuth Desktop Bridge ─────────────────────────────────
    ipcMain.handle('auth:google-desktop', async () => {
      return new Promise((resolve) => {
        let server = null
        let timeoutTimer = null

        const cleanup = () => {
          if (timeoutTimer) clearTimeout(timeoutTimer)
          if (server) {
            try { server.close() } catch {}
            server = null
          }
        }

        server = http.createServer((req, res) => {
          try {
            const reqUrl = url.parse(req.url, true)
            if (reqUrl.pathname === '/callback') {
              const rawData = reqUrl.query.data
              if (rawData) {
                const parsed = JSON.parse(rawData)
                res.writeHead(200, {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Access-Control-Allow-Origin': '*',
                })
                res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in to Yogatik Desktop</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e14; color: #f0f4f8; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #121820; border: 1px solid #1e2632; border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #ff6b35; font-size: 22px; margin-bottom: 12px; }
    p { color: #8892b0; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✨ Signed in successfully!</h1>
    <p>You are now authenticated in Yogatik Desktop. You can close this browser tab and return to the application.</p>
  </div>
</body>
</html>`)
                cleanup()
                if (mainWindow) {
                  if (mainWindow.isMinimized()) mainWindow.restore()
                  mainWindow.show()
                  mainWindow.focus()
                }
                resolve({ success: true, user: parsed, idToken: parsed.idToken })
                return
              }
            }
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('Bad Request')
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Error: ' + err.message)
            cleanup()
            resolve({ success: false, error: err.message })
          }
        })

        // Listen on random available port
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port
          const callbackUrl = `http://127.0.0.1:${port}/callback`
          const targetAuthUrl = `https://yogatik.web.app/auth-desktop.html?callback=${encodeURIComponent(callbackUrl)}`
          shell.openExternal(targetAuthUrl)

          // 2 minute timeout
          timeoutTimer = setTimeout(() => {
            cleanup()
            resolve({ success: false, error: 'Sign-in timed out. Please try again.' })
          }, 120_000)
        })

        server.on('error', (err) => {
          cleanup()
          resolve({ success: false, error: err.message })
        })
      })
    })

    // Global show/focus hotkey (works even when the window is hidden to tray).
    globalShortcut.register('CommandOrControl+Shift+Y', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
      else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
    })

    // Global Companion Mode Hotkey (Ctrl+Shift+Space) to summon/toggle floating companion
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      // Toggles the real floating companion window. This used to raise the MAIN
      // window and send 'toggle-companion-hotkey', which nothing listened for —
      // so the "floating companion" was only ever the app coming to the front.
      toggleCompanion()
    })

    // Global "act on my selection" hotkey: copy the foreground selection, then
    // relay the copied text to the renderer as a ready-to-send prompt.
    globalShortcut.register('CommandOrControl+Alt+C', () => {
      const relay = () => {
        const text = clipboard.readText() || ''
        // If the companion is the window the user is looking at, the selection
        // belongs THERE: raising the main app over their work is exactly what
        // the floating companion exists to avoid.
        if (isCompanionVisible() && sendToCompanion('clipboard-selection-hotkey', { text, at: Date.now() })) return
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show(); mainWindow.focus()
        mainWindow.webContents.send('clipboard-selection-hotkey', { text, at: Date.now() })
      }
      if (process.platform === 'win32') {
        // Send Ctrl+C to the foreground app first, then read after a short beat.
        exec(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"`,
          () => setTimeout(relay, 250))
      } else {
        relay()
      }
    })

    // Global quick search hotkey (brings up Yogatik and triggers the search modal)
    globalShortcut.register('CommandOrControl+Alt+K', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('menu', 'open-palette')
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
    stopPolling()    // Stop the clipboard poller
    stopAllWatchers()
    killAllPty()
    killAllMcpStdio()
    killAllBgProcesses()   // never orphan a background process on quit
    stopAllFsWatchers()
    stopAllMcpStdioClients()
    destroyAllSessions()   // close any agent browser windows and their tabs
    destroyCompanion()     // and the floating companion
    if (searchSidecar) {
      searchSidecar.kill()
    }
  })

  // With a tray icon the app intentionally keeps running when all windows close.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && app.isQuitting) app.quit()
  })
}