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

const { registerFsBridge, initJournal, snapshot: fsSnapshot } = require('./fsBridge.cjs')
const { safeSend, safeWin, alive } = require('./safeWindow.cjs')
const entitlement = require('./entitlement.cjs')
const { registerRootsIpc, rootPathsFor, resolvePath, getTrustState } = require('./roots.cjs')
const { enableProviderCors } = require('./cors.cjs')
const { buildMenu } = require('./menu.cjs')
const { registerDeepLink, handleSecondInstance } = require('./deepLink.cjs')
const { createTray } = require('./tray.cjs')
const { registerNotifications } = require('./notify.cjs')
const { initAutoUpdate, checkForUpdates } = require('./updater.cjs')
const { startScheduler, stopScheduler, registerSchedulerIPC } = require('./scheduler.cjs')
const { registerSubAgentIPC } = require('./subAgentRunner.cjs')
const { registerKeychain } = require('./keychain.cjs')
const { registerClipboard, stopPolling } = require('./clipboardManager.cjs')
const { registerWatcher, stopAllWatchers } = require('./watcher.cjs')
const { registerCodebaseMap } = require('./codebaseMap.cjs')
const { registerPower } = require('./power.cjs')
const { registerDialogs } = require('./dialogs.cjs')
const { registerProcesses } = require('./processes.cjs')
// The shared terminal timeline. Agent commands and the human's own land in one
// per-chat scrollback, so the model's shell is watchable and interruptible.
// pty.cjs's standalone sessions are superseded by terminalSession's tier 2.
const {
  registerTerminalSession, stopAllTerminals, runBlock: runTerminalBlock,
} = require('./terminalSession.cjs')
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
const { registerOllamaIpc, destroyOllamaDaemon } = require('./ollamaDaemon.cjs')
const { loadConfig: loadComfyConfig, registerComfyIpc, destroyComfyDaemon } = require('./comfyDaemon.cjs')
const { registerCastIpc, destroyCastControl } = require('./castControl.cjs')
const windowState = require('./windowState.cjs')

const isDev = !app.isPackaged
let mainWindow = null

// ── Last-resort crash guard ────────────────────────────────────────────────
//
// Electron's DEFAULT behaviour for an uncaught exception in main is the modal
// "A JavaScript error occurred in the main process" dialog, after which the app
// is dead. There is no recovery path, no log the user can find, and — because
// it fires before or during first paint — it can be the very first thing
// somebody sees after installing.
//
// The class of error that actually reaches here is a TEARDOWN RACE: a timer, an
// autoUpdater event or a watcher flush landing a tick after the window was
// destroyed. Those are harmless by definition — the work they were doing has no
// destination any more — so killing the app over one is strictly wrong.
//
// This is deliberately NOT a blanket "ignore all errors": anything else is
// logged with its stack and rethrown on the next tick so it still surfaces as a
// real crash rather than being silently swallowed.
const TEARDOWN_NOISE = /Object has been destroyed|Render frame was disposed|WebContents .* destroyed|has already been destroyed/i

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err)
  if (TEARDOWN_NOISE.test(msg)) {
    console.warn('[main] ignored teardown race:', msg)
    return
  }
  console.error('[main] uncaught exception:', err?.stack || msg)
  // Rethrow OUTSIDE this handler so genuine bugs are not hidden by the guard.
  setImmediate(() => { throw err })
})

process.on('unhandledRejection', (reason) => {
  const msg = String(reason?.message || reason)
  if (TEARDOWN_NOISE.test(msg)) return
  console.error('[main] unhandled rejection:', reason?.stack || msg)
})

// Windows needs an explicit AppUserModelID for notifications to display.
app.setAppUserModelId('app.yogatik.desktop')

// ── Performance & High-Computation Hardware Acceleration ─────────────────────
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-webgl2-compute-context')
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,WebGPU,CanvasOopRasterization')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192')
app.commandLine.appendSwitch('enable-hardware-overlays')

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

  // `mainWindow` is nulled by the 'closed' handler below, so a window destroyed
  // before it is ready would call .show() on null here.
  mainWindow.once('ready-to-show', () => { safeWin(mainWindow, w => w.show()) })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-electron', 'index.html'))
  }

  // External links open in the user's default browser, not inside the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    if (url.startsWith('file://')) {
      const parts = url.split(/[/\\]/).filter(Boolean)
      const lastPart = parts[parts.length - 1] || ''
      const cleanPath = lastPart.replace(/\.html$/i, '')
      shell.openExternal(`https://yogatik.web.app/${cleanPath}`)
      return { action: 'deny' }
    }
    return { action: 'deny' }
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
    if (!app.isQuitting) { e.preventDefault(); safeWin(mainWindow, w => w.hide()) }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
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
  app.on('second-instance', (_e, argv) => {
    // A yogatik:// link launched this second process; the URL is in its argv.
    // Without this the link only ever works on macOS.
    try { handleSecondInstance(argv) } catch { /* still focus the window below */ }
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      } else {
        createWindow()
      }
    } catch {
      createWindow()
    }
  })

  const getWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)

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

    // ── The gate goes FIRST, before any handler exists ──────────────────────
    // installGate wraps ipcMain.handle itself, so every channel registered
    // after this line is checked by name and an unclassified one fails closed.
    // Register anything above it and that handler is permanently ungated — and
    // the first things registered here are the FILE handlers. In a `personal`
    // build installGate is a no-op and no wrapper exists at all.
    entitlement.load(app.getPath('userData'))
    entitlement.installGate(ipcMain)
    entitlement.registerEntitlementIpc(ipcMain, { shell })

    registerDeepLink({ getWindow })

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
      // snapshot: a destructive git operation journals the working tree first,
      // which is the only thing that makes discard/reset recoverable at all.
      registerGitIpc({ rootPathsFor, snapshot: fsSnapshot })
      registerFsWatcherIpc({ rootPathsFor })
      // Not on the first-paint path (unlike roots/journal/fsBridge above): a
      // map is built lazily on the model's first codebase_map call, never on
      // window boot.
      registerCodebaseMap()
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
      registerTerminalSession(getWindow)
      registerMcpStdio()
      registerCompanionInput()
      registerBrowserControl(getWindow)
      registerCompanion({ dev: isDev })
      startScheduler()
      createTray(getWindow, { onToggleCompanion: toggleCompanion })
      initAutoUpdate(getWindow)
      // Zero-touch Ollama daemon: probe, auto-start, pull — no terminal needed.
      registerOllamaIpc(getWindow)
      // Zero-touch ComfyUI manager: probe, auto-start a configured install,
      // submit/poll/fetch generation jobs — no terminal needed.
      loadComfyConfig(app.getPath('userData'))
      registerComfyIpc(getWindow)
      // Cast Yogatik's own generated media to a UPnP/DLNA TV on the LAN —
      // SSDP discovery + a tiny local file server + SOAP, no external app,
      // no ffmpeg (see castCore.cjs for why neither is needed here).
      registerCastIpc()
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
      return safeWin(mainWindow, w => w.isAlwaysOnTop()) || false
    })

    ipcMain.handle('desktop:toggleAlwaysOnTop', (_, flag) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false
      const current = mainWindow.isAlwaysOnTop()
      const next = flag !== undefined ? Boolean(flag) : !current
      mainWindow.setAlwaysOnTop(next)
      safeSend(mainWindow, 'menu', { type: 'always-on-top-changed', value: next })
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

    // The AGENT's shell. It goes through the SAME per-chat timeline the human's
    // terminal drawer renders, so every command the model runs is watchable and
    // interruptible as it happens. Before this it collected stdout and stderr
    // and forwarded none of it until the process closed — a 30-second command
    // was a spinner and then a card, and anything run before the panel was
    // opened was invisible forever.
    ipcMain.handle('terminal:exec', async (_e, { ctx, command, cwd, timeout = 300000, env: extraEnv, shell } = {}) => {
      const block = await runTerminalBlock({
        ctx, command, cwd, timeout, env: extraEnv, author: 'agent', shell,
      })
      return {
        // A non-zero exit code is a RESULT, not a tool failure. Only "never
        // started" is an error — otherwise a missing folder, a bad cwd and a
        // failing test all print as "terminal_run: Unknown error".
        success: block.status === 'exited' && block.exitCode === 0,
        exitCode: block.exitCode,
        stdout: block.output || '',
        stderr: '',
        shell: block.shell,
        killed: block.status === 'killed',
        blockId: block.id,
        durationMs: block.durationMs,
        ...(block.error ? { error: block.error } : {}),
        ...(block.status === 'killed'
          ? { note: `Timed out after ${timeout}ms and was killed. Use proc_start for long-running commands.` }
          : {}),
      }
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
      safeSend(mainWindow, 'companion-mode-changed', isCompanionActive)
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
                try {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    if (mainWindow.isMinimized()) mainWindow.restore()
                    mainWindow.show()
                    mainWindow.focus()
                  }
                } catch {}
                resolve({ success: true, user: parsed, idToken: parsed.idToken, googleIdToken: parsed.googleIdToken || null })
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
      try {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow()
          return
        }
        if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
        else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
      } catch {}
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
        try {
          const text = clipboard.readText() || ''
          // If the companion is the window the user is looking at, the selection
          // belongs THERE: raising the main app over their work is exactly what
          // the floating companion exists to avoid.
          if (isCompanionVisible() && sendToCompanion('clipboard-selection-hotkey', { text, at: Date.now() })) return
          if (!alive(mainWindow)) return
          safeWin(mainWindow, w => {
            if (w.isMinimized()) w.restore()
            w.show(); w.focus()
          })
          safeSend(mainWindow, 'clipboard-selection-hotkey', { text, at: Date.now() })
        } catch {}
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
      try {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow()
          return
        }
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        safeSend(mainWindow, 'menu', 'open-palette')
      } catch {}
    })

    app.on('activate', () => {
      try {
        if (BrowserWindow.getAllWindows().length === 0 || !mainWindow || mainWindow.isDestroyed()) createWindow()
        else mainWindow.show()
      } catch {
        createWindow()
      }
    })
  })

  app.on('before-quit', () => { app.isQuitting = true })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopScheduler()  // Stop the cron daemon gracefully
    stopPolling()    // Stop the clipboard poller
    stopAllWatchers()
    stopAllTerminals()
    killAllMcpStdio()
    killAllBgProcesses()   // never orphan a background process on quit
    stopAllFsWatchers()
    stopAllMcpStdioClients()
    destroyAllSessions()   // close any agent browser windows and their tabs
    destroyCompanion()     // and the floating companion
    destroyOllamaDaemon()  // kill any managed Ollama daemon + in-progress pulls
    destroyComfyDaemon()   // kill any managed ComfyUI process
    destroyCastControl()   // stop the cast file server and clear discovered devices
    if (searchSidecar) {
      searchSidecar.kill()
    }
  })

  // With a tray icon the app intentionally keeps running when all windows close.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && app.isQuitting) app.quit()
  })
}