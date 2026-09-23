/**
 * Type declarations for the pre-existing CommonJS electron modules.
 * The refactored .ts files import these .cjs modules, which have no
 * declarations of their own — these shims keep strict type-checking on the
 * new code while treating the legacy modules as loosely-typed.
 */

declare module './entitlement' {
  export const entitlement: {
    load(path: string): void
    installGate(ipcMain: unknown): void
    registerEntitlementIpc(ipcMain: unknown, opts: unknown): void
  }
}

declare module './deepLink' {
  export function registerDeepLink(opts: unknown): void
  export function handleSecondInstance(argv: string[]): void
}

declare module './cors' {
  export function enableProviderCors(): void
}

declare module './adBlocker' {
  export function enableAdBlocker(): void
}

declare module './roots' {
  export function registerRootsIpc(opts: unknown): void
  export function rootPathsFor(opts: unknown): string[]
  export function resolvePath(root: unknown, path: string): string
  export function getTrustState(): unknown
}

declare module './journal' {
  export function initJournal(path: string): void
  export function snapshot(): unknown
}

declare module './fsBridge' {
  export function registerFsBridge(): void
  export function snapshot(): unknown
}

declare module './security' {
  export function applyCSP(window: unknown): void
}

declare module './menu' {
  export function buildMenu(window: unknown, opts: unknown): void
}

declare module './tray' {
  export function createTray(getWindow: () => unknown, opts: unknown): void
}

declare module './updater' {
  export function initAutoUpdate(getWindow: () => unknown): void
  export function checkForUpdates(getWindow: () => unknown): void
}

declare module './notify' {
  export function registerNotifications(getWindow: () => unknown): void
}

declare module './scheduler' {
  export function startScheduler(): void
  export function stopScheduler(): void
  export function registerSchedulerIPC(opts: unknown): void
}

declare module './subAgentRunner' {
  export function registerSubAgentIPC(): void
}

declare module './keychain' {
  export function registerKeychain(): void
}

declare module './clipboardManager' {
  export function registerClipboard(getWindow: () => unknown): void
  export function stopPolling(): void
}

declare module './watcher' {
  export function registerWatcher(getWindow: () => unknown): void
  export function stopAllWatchers(): void
}

declare module './codebaseMap' {
  export function registerCodebaseMap(): void
}

declare module './power' {
  export function registerPower(getWindow: () => unknown, opts: unknown): void
}

declare module './dialogs' {
  export function registerDialogs(getWindow: () => unknown): void
}

declare module './processes' {
  export function registerProcesses(): void
}

declare module './terminalSession' {
  export function registerTerminalSession(getWindow: () => unknown): void
  export function stopAllTerminals(): void
  export function runBlock(opts: unknown): Promise<unknown>
}

declare module './mcpStdio' {
  export function registerMcpStdio(): void
  export function killAllMcpStdio(): void
}

declare module './mcpStdioClient' {
  export function registerMcpStdioClientIpc(): void
  export function stopAllMcpStdioClients(): void
}

declare module './companionInput' {
  export function registerCompanionInput(): void
}

declare module './browserControl' {
  export function registerBrowserControl(getWindow: () => unknown): void
  export function destroyAllSessions(): void
}

declare module './companionWindow' {
  export function registerCompanion(opts: unknown): void
  export function toggle(): void
  export function destroy(): void
  export function isVisible(): boolean
  export function sendToCompanion(channel: string, data: unknown): boolean
}

declare module './bgProcesses' {
  export function registerBgProcessIpc(opts: unknown): void
  export function killAllBgProcesses(): void
}

declare module './git' {
  export function registerGitIpc(opts: unknown): void
}

declare module './fsWatcher' {
  export function registerFsWatcherIpc(opts: unknown): void
  export function stopAllFsWatchers(): void
}

declare module './ollamaDaemon' {
  export function registerOllamaIpc(getWindow: () => unknown): void
  export function destroyOllamaDaemon(): void
}

declare module './comfyDaemon' {
  export function loadConfig(path: string): void
  export function registerComfyIpc(getWindow: () => unknown): void
  export function destroyComfyDaemon(): void
}

declare module './castControl' {
  export function registerCastIpc(): void
  export function destroyCastControl(): void
}

declare module './torrentManager' {
  export function registerTorrentIpc(getWindow: () => unknown): void
  export function destroyTorrentManager(): void
}

declare module './windowState' {
  export function restore(defaults: unknown): { width: number; height: number; x?: number; y?: number; maximized: boolean }
  export function track(window: unknown): void
}