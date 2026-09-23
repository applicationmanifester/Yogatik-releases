/**
 * ServiceRegistry — Background services lifecycle & teardown
 *
 * Owns: search sidecar, companion, global shortcuts, and all background
 * feature modules. Centralizes teardown so `will-quit` never orphans anything.
 */

import { Logger } from './Logger'
import { ConfigManager, AppConfig } from './ConfigManager'
import { GlobalShortcuts, GlobalShortcutsConfig } from './GlobalShortcuts'
import { SearchSidecar } from '../services/SearchSidecar'
import { BrowserWindow } from 'electron'

type FeatureName = keyof AppConfig['features']

export class ServiceRegistry {
  private searchSidecar: SearchSidecar | null = null
  private globalShortcuts: GlobalShortcuts | null = null
  private companionActive = false
  private preCompanionBounds: { x: number; y: number; width: number; height: number } | null = null
  private windowRef: (() => BrowserWindow | null) | null = null

  constructor(
    private readonly config: ConfigManager,
    private readonly logger: Logger,
  ) {}

  /**
   * Called by Application after the window exists, so ServiceRegistry can
   * reach it without a constructor circular dependency.
   */
  setWindowRef(getWindow: () => BrowserWindow | null): void {
    this.windowRef = getWindow
  }

  getSearchSidecar(): SearchSidecar | null {
    return this.searchSidecar
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Startup — all non-blocking, each failure isolated
  // ───────────────────────────────────────────────────────────────────────────

  startAll(): void {
    // Registered on the next turn of the loop, so the window is already on
    // screen and painting while these run.
    setImmediate(() => {
      const featureModules: Array<[string, () => void]> = [
        ['bgProcesses', () => this.startBgProcesses()],
        ['git', () => this.startGit()],
        ['fsWatcher', () => this.startFsWatcher()],
        ['codebaseMap', () => this.startCodebaseMap()],
        ['mcpStdioClient', () => this.startMcpStdioClient()],
        ['notifications', () => this.startNotifications()],
        ['scheduler', () => this.startScheduler()],
        ['subAgent', () => this.startSubAgent()],
        ['keychain', () => this.startKeychain()],
        ['clipboard', () => this.startClipboard()],
        ['watcher', () => this.startWatcher()],
        ['power', () => this.startPower()],
        ['dialogs', () => this.startDialogs()],
        ['processes', () => this.startProcesses()],
        ['terminal', () => this.startTerminal()],
        ['mcpStdio', () => this.startMcpStdio()],
        ['companionInput', () => this.startCompanionInput()],
        ['browserControl', () => this.startBrowserControl()],
        ['companion', () => this.startCompanion()],
        ['tray', () => this.startTray()],
        ['autoUpdate', () => this.startAutoUpdate()],
        ['ollama', () => this.startOllama()],
        ['comfyUI', () => this.startComfyUI()],
        ['cast', () => this.startCast()],
        ['torrents', () => this.startTorrents()],
      ]

      for (const [name, start] of featureModules) {
        if (!this.config.isFeatureEnabled(name as FeatureName)) {
          this.logger.info(`Feature disabled, skipping: ${name}`)
          continue
        }
        try {
          start()
          this.logger.debug(`Feature started: ${name}`)
        } catch (e) {
          // One feature failing must not block the rest
          this.logger.error(`Feature failed to start: ${name}`, { error: String(e) })
        }
      }
    })

    // Search sidecar starts without awaiting — nothing depends on it being up.
    this.startSearchSidecar()

    // Warm the AI capability probe at boot: the numbers (GPU adapter, VRAM,
    // cores) take one expensive getGPUInfo call, and doing it here means the
    // renderer's first desktop:getAiCapabilities call is instant — and the
    // Ollama/ComfyUI defaults are ready before the model is ever invoked.
    const { probeAiCapabilities } = require('./AiCapabilities') as {
      probeAiCapabilities(force?: boolean): Promise<{
        gpu: { available: boolean; vramBytesEstimate: number | null }
        inference: { ollamaNumGpuLayers: number; ollamaNumThread: number; rendererHeapMb: number }
      }>
    }
    probeAiCapabilities()
      .then((caps) => this.logger.info('AI capabilities probed', {
        gpuAvailable: caps.gpu.available,
        vramEstimateGb: caps.gpu.vramBytesEstimate != null
          ? Math.round(caps.gpu.vramBytesEstimate / (1024 * 1024 * 1024))
          : null,
        ollamaNumGpuLayers: caps.inference.ollamaNumGpuLayers,
        ollamaNumThread: caps.inference.ollamaNumThread,
        rendererHeapMb: caps.inference.rendererHeapMb,
      }))
      .catch((err: Error) => this.logger.warn('AI capability probe failed', { error: String(err) }))
  }

  private startSearchSidecar(): void {
    this.searchSidecar = new SearchSidecar(this.logger.child({ service: 'search-sidecar' }))
    this.searchSidecar.start().catch((err) => {
      this.logger.warn('Search sidecar unavailable', { error: String(err) })
    })
  }

  private startBgProcesses(): void {
    const { registerBgProcessIpc } = require('./bgProcesses')
    const { rootPathsFor, resolvePath, getTrustState } = require('./roots')
    registerBgProcessIpc({ rootPathsFor, resolvePath, getTrustState })
  }

  private startGit(): void {
    const { registerGitIpc } = require('./git')
    const { rootPathsFor } = require('./roots')
    const { snapshot } = require('./fsBridge')
    // snapshot: a destructive git operation journals the working tree first,
    // which is the only thing that makes discard/reset recoverable at all.
    registerGitIpc({ rootPathsFor, snapshot })
  }

  private startFsWatcher(): void {
    const { registerFsWatcherIpc } = require('./fsWatcher')
    const { rootPathsFor } = require('./roots')
    registerFsWatcherIpc({ rootPathsFor })
  }

  private startCodebaseMap(): void {
    const { registerCodebaseMap } = require('./codebaseMap')
    registerCodebaseMap()
  }

  private startMcpStdioClient(): void {
    const { registerMcpStdioClientIpc } = require('./mcpStdioClient')
    registerMcpStdioClientIpc()
  }

  private startNotifications(): void {
    const { registerNotifications } = require('./notify')
    registerNotifications(() => this.getMainWindowSafe())
  }

  private startScheduler(): void {
    const { registerSchedulerIPC, startScheduler } = require('./scheduler')
    registerSchedulerIPC({ getWindow: () => this.getMainWindowSafe() })
    startScheduler()
  }

  private startSubAgent(): void {
    const { registerSubAgentIPC } = require('./subAgentRunner')
    registerSubAgentIPC()
  }

  private startKeychain(): void {
    const { registerKeychain } = require('./keychain')
    registerKeychain()
  }

  private startClipboard(): void {
    const { registerClipboard } = require('./clipboardManager')
    registerClipboard(() => this.getMainWindowSafe())
  }

  private startWatcher(): void {
    const { registerWatcher } = require('./watcher')
    registerWatcher(() => this.getMainWindowSafe())
  }

  private startPower(): void {
    const { registerPower } = require('./power')
    const { startScheduler, stopScheduler } = require('./scheduler')
    registerPower(() => this.getMainWindowSafe(), {
      pauseScheduler: stopScheduler,
      resumeScheduler: startScheduler,
    })
  }

  private startDialogs(): void {
    const { registerDialogs } = require('./dialogs')
    registerDialogs(() => this.getMainWindowSafe())
  }

  private startProcesses(): void {
    const { registerProcesses } = require('./processes')
    registerProcesses()
  }

  private startTerminal(): void {
    const { registerTerminalSession } = require('./terminalSession')
    registerTerminalSession(() => this.getMainWindowSafe())
  }

  private startMcpStdio(): void {
    const { registerMcpStdio } = require('./mcpStdio')
    registerMcpStdio()
  }

  private startCompanionInput(): void {
    const { registerCompanionInput } = require('./companionInput')
    registerCompanionInput()
  }

  private startBrowserControl(): void {
    const { registerBrowserControl } = require('./browserControl')
    registerBrowserControl(() => this.getMainWindowSafe())
  }

  private startCompanion(): void {
    const { registerCompanion } = require('./companionWindow')
    registerCompanion({ dev: !require('electron').app.isPackaged })
  }

  private startTray(): void {
    const { createTray } = require('./tray')
    createTray(() => this.getMainWindowSafe(), {
      onToggleCompanion: () => this.toggleCompanion(),
    })
  }

  private startAutoUpdate(): void {
    const { initAutoUpdate } = require('./updater')
    initAutoUpdate(() => this.getMainWindowSafe())
  }

  private startOllama(): void {
    const { registerOllamaIpc } = require('./ollamaDaemon')
    registerOllamaIpc(() => this.getMainWindowSafe())
  }

  private startComfyUI(): void {
    const { loadConfig, registerComfyIpc } = require('./comfyDaemon')
    const { app } = require('electron')
    loadConfig(app.getPath('userData'))
    registerComfyIpc(() => this.getMainWindowSafe())
  }

  private startCast(): void {
    const { registerCastIpc } = require('./castControl')
    registerCastIpc()
  }

  private startTorrents(): void {
    const { registerTorrentIpc } = require('./torrentManager')
    registerTorrentIpc(() => this.getMainWindowSafe())
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Companion mode
  // ───────────────────────────────────────────────────────────────────────────

  setCompanionMode(enable?: boolean): boolean {
    const { screen } = require('electron')
    const window = this.getMainWindowSafe()
    if (!window) return false

    const next = enable !== undefined ? Boolean(enable) : !this.companionActive

    if (next && !this.companionActive) {
      this.preCompanionBounds = window.getBounds()
      this.companionActive = true
      const workArea = screen.getPrimaryDisplay().workArea
      const compWidth = 380
      const compHeight = 600
      window.setAlwaysOnTop(true, 'floating')
      window.setBounds({
        x: Math.round(workArea.x + workArea.width - compWidth - 20),
        y: Math.round(workArea.y + workArea.height - compHeight - 20),
        width: compWidth,
        height: compHeight,
      })
    } else if (!next && this.companionActive) {
      this.companionActive = false
      window.setAlwaysOnTop(false)
      if (this.preCompanionBounds) {
        window.setBounds(this.preCompanionBounds)
      } else {
        const windowConfig = this.config.get('window')
        window.setSize(windowConfig.defaultWidth, windowConfig.defaultHeight)
        window.center()
      }
    }

    window.webContents.send('companion-mode-changed', this.companionActive)
    return this.companionActive
  }

  toggleCompanion(): void {
    try {
      const { toggle } = require('./companionWindow')
      toggle()
    } catch (e) {
      this.logger.error('Failed to toggle companion', { error: String(e) })
    }
  }

  isCompanionVisible(): boolean {
    try {
      const { isVisible } = require('./companionWindow')
      return isVisible()
    } catch {
      return false
    }
  }

  sendToCompanion(channel: string, data: unknown): boolean {
    try {
      const { sendToCompanion } = require('./companionWindow')
      return sendToCompanion(channel, data)
    } catch {
      return false
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Global shortcuts
  // ───────────────────────────────────────────────────────────────────────────

  setupGlobalShortcuts(shortcutConfig: Omit<GlobalShortcutsConfig, 'logger'>): void {
    this.globalShortcuts = new GlobalShortcuts({
      ...shortcutConfig,
      logger: this.logger.child({ service: 'shortcuts' }),
    })
    this.globalShortcuts.registerAll()
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Teardown — every service stopped, nothing orphaned
  // ───────────────────────────────────────────────────────────────────────────

  teardownAll(): void {
    this.globalShortcuts?.unregisterAll()
    this.searchSidecar?.stop()

    const teardownModules: Array<[string, () => void]> = [
      ['scheduler', () => require('./scheduler').stopScheduler()],
      ['clipboard', () => require('./clipboardManager').stopPolling()],
      ['watchers', () => require('./watcher').stopAllWatchers()],
      ['terminals', () => require('./terminalSession').stopAllTerminals()],
      ['mcpStdio', () => require('./mcpStdio').killAllMcpStdio()],
      ['bgProcesses', () => require('./bgProcesses').killAllBgProcesses()],
      ['fsWatchers', () => require('./fsWatcher').stopAllFsWatchers()],
      ['mcpStdioClients', () => require('./mcpStdioClient').stopAllMcpStdioClients()],
      ['browserControl', () => require('./browserControl').destroyAllSessions()],
      ['companion', () => require('./companionWindow').destroy()],
      ['ollama', () => require('./ollamaDaemon').destroyOllamaDaemon()],
      ['comfyUI', () => require('./comfyDaemon').destroyComfyDaemon()],
      ['cast', () => require('./castControl').destroyCastControl()],
      ['torrents', () => require('./torrentManager').destroyTorrentManager()],
    ]

    for (const [name, teardown] of teardownModules) {
      try {
        teardown()
        this.logger.debug(`Service torn down: ${name}`)
      } catch (e) {
        // One teardown failure must not block the rest
        this.logger.error(`Service teardown failed: ${name}`, { error: String(e) })
      }
    }

    this.logger.info('All services torn down')
  }

  private getMainWindowSafe(): BrowserWindow | null {
    const window = this.getMainWindow()
    return window && !window.isDestroyed() ? window : null
  }

  private getMainWindow(): BrowserWindow | null {
    return this.windowRef ? this.windowRef() : null
  }
}