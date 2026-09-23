/**
 * Application — Core lifecycle orchestrator (split for maintainability)
 *
 * Composes from:
 * - WindowLifecycle      — window creation/state
 * - IpcRegistration      — all IPC handler registration
 * - ServiceRegistry      — background services & teardown
 */

import { BrowserWindow, shell, app, ipcMain } from 'electron'
import { join } from 'path'
import * as os from 'os'
import { Logger } from './Logger'
import { ConfigManager } from './ConfigManager'
import { IpcRouter } from './IpcRouter'
import { WindowLifecycle } from './WindowLifecycle'
import { registerIpcHandlers } from './IpcRegistration'
import { ServiceRegistry } from './ServiceRegistry'

// The pre-existing electron modules are CommonJS (.cjs) without declarations;
// they are loaded via require() — the same pattern every other module in this
// codebase uses for them — rather than static imports that cannot resolve.
const entitlement = require('./entitlement.cjs') as {
  load(path: string): void
  installGate(ipcMain: unknown): void
  registerEntitlementIpc(ipcMain: unknown, opts: unknown): void
}
const { registerDeepLink } = require('./deepLink.cjs') as { registerDeepLink(opts: unknown): void }
const { enableProviderCors } = require('./cors.cjs') as { enableProviderCors(): void }
const { enableAdBlocker } = require('./adBlocker.cjs') as { enableAdBlocker(): void }
const { registerRootsIpc } = require('./roots.cjs') as { registerRootsIpc(opts: unknown): void }
// initJournal lives beside the fs bridge (see original main.cjs import).
const { initJournal } = require('./fsBridge.cjs') as { initJournal(path: string): void }
const { registerFsBridge } = require('./fsBridge.cjs') as { registerFsBridge(): void }
const { applyCSP } = require('./security.cjs') as { applyCSP(window: unknown): void }

export class Application {
  private windowLifecycle: WindowLifecycle
  private serviceRegistry: ServiceRegistry
  private ipcRouter: IpcRouter
  private _isQuitting = false

  constructor(
    private readonly config: ConfigManager,
    private readonly logger: Logger,
  ) {
    this.ipcRouter = new IpcRouter(logger)
    this.windowLifecycle = new WindowLifecycle(config, logger)
    this.serviceRegistry = new ServiceRegistry(config, logger)
  }

  get isQuitting(): boolean {
    return this._isQuitting
  }

  get mainWindow(): BrowserWindow | null {
    return this.windowLifecycle.getWindow()
  }

  async initialize(): Promise<void> {
    this.configureAppPerformance()
    enableProviderCors()
    enableAdBlocker()

    // ── The gate goes FIRST, before any handler exists ──────────────────────
    // installGate wraps ipcMain.handle itself, so every channel registered
    // after this line is checked by name and an unclassified one fails closed.
    entitlement.load(app.getPath('userData'))
    entitlement.installGate(ipcMain)
    entitlement.registerEntitlementIpc(ipcMain, { shell })

    // Deep linking
    registerDeepLink({ getWindow: () => this.mainWindow })

    // Roots & journal first: fsBridge resolves every path against them.
    registerRootsIpc({ getWindow: () => this.mainWindow })
    initJournal(join(app.getPath('userData'), 'yogatik-journal'))
    registerFsBridge()

    // ── The window comes FIRST ──────────────────────────────────────────────
    // The renderer cannot call anything until it has loaded — several hundred
    // milliseconds away. Doing all IPC registration before createWindow()
    // simply delayed the window for no benefit.
    this.windowLifecycle.createWindow()

    // Give ServiceRegistry access to the window (avoids constructor cycle)
    this.serviceRegistry.setWindowRef(() => this.mainWindow)

    // Register all IPC handlers (after window exists)
    registerIpcHandlers({
      ipcRouter: this.ipcRouter,
      getWindow: () => this.mainWindow,
      config: this.config,
      logger: this.logger,
      serviceRegistry: this.serviceRegistry,
    })

    // Background services (non-blocking, after window is painting)
    this.serviceRegistry.startAll()

    // Global shortcuts
    this.serviceRegistry.setupGlobalShortcuts({
      getWindow: () => this.mainWindow,
      toggleCompanion: () => this.serviceRegistry.toggleCompanion(),
      isCompanionVisible: () => this.serviceRegistry.isCompanionVisible(),
      sendToCompanion: (ch: string, data: unknown) => this.serviceRegistry.sendToCompanion(ch, data),
    })
  }

  private configureAppPerformance(): void {
    app.commandLine.appendSwitch('enable-gpu-rasterization')
    app.commandLine.appendSwitch('enable-zero-copy')
    // ignore-gpu-blocklist is deliberate but bounded: it forces GPU on
    // hardware Chrome blocklists for stability. If a user reports rendering
    // corruption, this is the first switch to drop.
    app.commandLine.appendSwitch('ignore-gpu-blocklist')
    app.commandLine.appendSwitch('enable-webgl2-compute-context')
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

    const videoFeatures = process.platform === 'win32'
      ? 'MediaFoundationVideoDecoder,D3D11VideoDecoder,WebGPU,CanvasOopRasterization'
      : 'VaapiVideoDecoder,WebGPU,CanvasOopRasterization'
    app.commandLine.appendSwitch('enable-features', videoFeatures)

    // Heap SCALED to the machine, not a hardcoded 8192. A fixed 8GB heap on a
    // 4GB machine makes the OS swap; on a 32GB machine it starves the model
    // runtimes of headroom. 25% of RAM, clamped [512, 16384] MB.
    const { tuneRendererHeapMb } = require('./AiCapabilities')
    const heapMb = tuneRendererHeapMb(os.totalmem())
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heapMb}`)

    app.commandLine.appendSwitch('enable-hardware-overlays')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Lifecycle hooks (wired from main.ts)
  // ───────────────────────────────────────────────────────────────────────────

  beforeQuit(): void {
    this._isQuitting = true
    // app.isQuitting is a custom flag the tray menu / Cmd+Q path reads; the
    // Electron App type does not declare it.
    ;(app as unknown as { isQuitting: boolean }).isQuitting = true
  }

  willQuit(): void {
    this.serviceRegistry.teardownAll()
  }

  activate(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.windowLifecycle.createWindow()
    } else {
      this.mainWindow.show()
    }
  }

  handleSecondInstance(argv: string[]): void {
    this.windowLifecycle.handleSecondInstance(argv)
  }
}