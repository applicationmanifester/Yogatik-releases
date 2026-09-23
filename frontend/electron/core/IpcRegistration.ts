/**
 * IpcRegistration — All IPC handler registration, split from Application
 *
 * Every handler goes through IpcRouter, which provides error boundaries,
 * logging with correlation IDs, validation, and timeouts.
 */

import { Logger } from './Logger'
import { ConfigManager } from './ConfigManager'
import { IpcRouter } from './IpcRouter'
import { ServiceRegistry } from './ServiceRegistry'
import { BrowserWindow } from 'electron'
import { shell } from 'electron'

export interface IpcRegistrationContext {
  ipcRouter: IpcRouter
  getWindow: () => BrowserWindow | null
  config: ConfigManager
  logger: Logger
  serviceRegistry: ServiceRegistry
}

export function registerIpcHandlers(ctx: IpcRegistrationContext): void {
  const { ipcRouter, getWindow, config, logger, serviceRegistry } = ctx

  // ── Desktop system info & window controls ────────────────────────────────

  ipcRouter.register('desktop:isAlwaysOnTop', () => {
    return getWindow()?.isAlwaysOnTop() ?? false
  })

  ipcRouter.register('desktop:toggleAlwaysOnTop', (_, flag?: boolean) => {
    const window = getWindow()
    if (!window) return false
    const current = window.isAlwaysOnTop()
    const next = flag !== undefined ? Boolean(flag) : !current
    window.setAlwaysOnTop(next)
    window.webContents.send('menu', { type: 'always-on-top-changed', value: next })
    return next
  })

  ipcRouter.register('desktop:getSystemInfo', () => {
    const os = require('os')
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

  ipcRouter.register('desktop:showItemInFolder', (_, p?: string) => {
    if (!p) return false
    const path = require('path')
    shell.showItemInFolder(path.normalize(p))
    return true
  })

  ipcRouter.register('desktop:openPath', async (_, p?: string) => {
    if (!p) return false
    const path = require('path')
    await shell.openPath(path.normalize(p))
    return true
  })

  ipcRouter.register('desktop:openExternal', async (_, url?: string) => {
    if (!url) return false
    try {
      if (/^https?:/.test(url)) {
        await shell.openExternal(url)
        return true
      }
    } catch { /* ignore */ }
    return false
  })

  // ── Secure JS evaluation (RCE FIX: no require/Node APIs in sandbox) ──────

  ipcRouter.register(
    'desktop:eval-js',
    async (_, params?: { code?: string; timeoutMs?: number }) => {
      const code = params?.code
      if (!code || typeof code !== 'string') {
        return { success: false, error: 'No code provided' }
      }
      const { SecureVmSandbox } = require('../security/VmSandbox')
      const sandbox = new SecureVmSandbox({ timeout: params?.timeoutMs ?? 5000 })
      return sandbox.execute(code)
    },
    { timeout: 35000 }, // Slightly above max sandbox timeout
  )

  // ── Local search ─────────────────────────────────────────────────────────

  ipcRouter.register(
    'local-search',
    async (_, query?: string, options: Record<string, unknown> = {}) => {
      if (!query) throw new Error('Query is required')
      const sidecar = serviceRegistry.getSearchSidecar()
      if (!sidecar?.isReady()) {
        throw new Error('Search sidecar not running')
      }
      return sidecar.search(query, options)
    },
    { timeout: 15000 },
  )

  // ── Terminal (agent shell through per-chat timeline) ─────────────────────

  ipcRouter.register(
    'terminal:exec',
    async (_, params: Record<string, unknown> = {}) => {
      const { runBlock } = require('./terminalSession')
      const block = await runBlock({
        ctx: params.ctx,
        command: params.command,
        cwd: params.cwd,
        timeout: params.timeout ?? 300000,
        env: params.env,
        author: 'agent',
        shell: params.shell,
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
          ? { note: `Timed out after ${params.timeout}ms and was killed. Use proc_start for long-running commands.` }
          : {}),
      }
    },
    { timeout: 0 }, // Managed internally by terminalSession
  )

  // ── Auth (Google OAuth desktop bridge) ───────────────────────────────────

  ipcRouter.register(
    'auth:google-desktop',
    async () => {
      const { handleGoogleAuth } = require('./authHandler')
      return handleGoogleAuth({ getWindow, logger, timeoutMs: config.get('timeouts').auth })
    },
    { timeout: 0 }, // Manages its own timeout (120s)
  )

  // ── Screen capture & active window ───────────────────────────────────────

  ipcRouter.register('desktop:captureScreen', async () => {
    const { desktopCapturer } = require('electron')
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1920, height: 1080 },
      })
      const primary = sources.find((s: { id: string }) => s.id.startsWith('screen:')) || sources[0]
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
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcRouter.register('desktop:getActiveWindow', async () => {
    const { getActiveWindow } = require('../system/ActiveWindow')
    return getActiveWindow()
  })

  // ── AI capabilities (hardware probe for max AI utilization) ──────────────

  ipcRouter.register(
    'desktop:getAiCapabilities',
    async (_, force = false) => {
      const { probeAiCapabilities } = require('./AiCapabilities')
      // Cached with a TTL; the boot-time warm probe in ServiceRegistry makes
      // the first renderer call instant in the common case.
      return probeAiCapabilities(Boolean(force))
    },
    { timeout: 10000 },
  )

  // ── Companion mode ───────────────────────────────────────────────────────

  ipcRouter.register('desktop:setCompanionMode', (_, enable?: boolean) => {
    return serviceRegistry.setCompanionMode(enable)
  })

  // ── Execute action (RCE FIX: sanitized through InputSanitizer) ───────────

  ipcRouter.register(
    'desktop:executeAction',
    async (_, action?: unknown) => {
      const { InputSanitizer } = require('../security/InputSanitizer')
      const sanitizer = new InputSanitizer()
      const sanitized = sanitizer.sanitizeAction(action)
      if (!sanitized.valid) {
        return { success: false, error: sanitized.error }
      }
      const { executeAction } = require('../system/ActionExecutor')
      return executeAction(sanitized.action!)
    },
    { timeout: 10000 },
  )

  logger.info(`IPC handlers registered: ${ipcRouter['handlers']?.size ?? 'all'} channels`)
}