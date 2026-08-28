import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { IpcContracts, IpcCommand } from './main'

// ============================================================================
// Type-Safe IPC Channel Generation
// ============================================================================

const IPC_CHANNELS = [
  'fs:read', 'fs:write', 'fs:edit', 'fs:search',
  'proc:start', 'proc:read', 'proc:kill', 'proc:list',
  'browser:create', 'browser:navigate', 'browser:execute', 'browser:close', 'browser:list',
  'terminal:exec', 'terminal:resize', 'terminal:close', 'terminal:list',
  'search:query',
  'chat:send', 'chat:history',
  'mcp:call', 'mcp:list',
  'clipboard:read', 'clipboard:write', 'clipboard:watch',
  'watcher:add', 'watcher:remove', 'watcher:list',
  'power:assert', 'power:release',
  'dialog:show',
  'processes:list',
  'git:status', 'git:diff', 'git:commit',
  'fs:watcher:add', 'fs:watcher:remove',
  'mcp:stdio:call',
  'companion:show', 'companion:hide',
  'scheduler:add', 'scheduler:remove', 'scheduler:list',
] as const satisfies readonly IpcCommand[]

// ============================================================================
// Safe Event Bridge with AbortSignal Support
// ============================================================================

interface EventSubscription {
  abort(): void
}

function createEventBridge<T extends Record<string, string>>(
  eventMap: T
): { [K in keyof T]: (callback: (payload: any) => void) => EventSubscription } {
  const result = {} as any

  for (const [eventName, ipcChannel] of Object.entries(eventMap)) {
    result[eventName] = (callback: (payload: any) => void) => {
      const handler = (_event: IpcRendererEvent, payload: any) => callback(payload)
      ipcRenderer.on(ipcChannel, handler)
      return {
        abort: () => ipcRenderer.removeListener(ipcChannel, handler)
      }
    }
  }

  return result
}

// ============================================================================
// Type-Safe Invocation Wrapper
// ============================================================================

async function invoke<K extends IpcCommand>(
  channel: K,
  payload: IpcContracts[K]
): Promise<any> {
  // Validate channel is allowed
  if (!IPC_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`)
  }
  return ipcRenderer.invoke(channel, payload)
}

// ============================================================================
// Exposed API
// ============================================================================

const api = {
  // File System
  fs: {
    read: (path: string, maxBytes?: number, offset?: number, limit?: number) =>
      invoke('fs:read', { path, maxBytes, offset, limit }),
    write: (path: string, content: string, expectedHash?: string, keepEol?: boolean) =>
      invoke('fs:write', { path, content, expectedHash, keepEol }),
    edit: (path: string, edits: Array<{ oldText: string; newText: string }>, expectedHash?: string) =>
      invoke('fs:edit', { path, edits, expectedHash }),
    search: (pattern: string, root: string, include?: string[], exclude?: string[], maxResults?: number) =>
      invoke('fs:search', { pattern, root, include, exclude, maxResults }),
  },

  // Background Processes
  proc: {
    start: (chatId: string, command: string, cwd: string, env?: Record<string, string>) =>
      invoke('proc:start', { chatId, command, cwd, env }),
    read: (id: string, offset?: number) =>
      invoke('proc:read', { id, offset }),
    kill: (id: string, signal?: string) =>
      invoke('proc:kill', { id, signal }),
    list: (chatId?: string) =>
      invoke('proc:list', { chatId } as any),
    onOutput: createEventBridge({
      output: 'proc:output',
      exit: 'proc:exit',
    }),
  },

  // Browser Control
  browser: {
    create: (url: string, mode: 'panel' | 'window', bounds?: { x: number; y: number; width: number; height: number }) =>
      invoke('browser:create', { url, mode, bounds }),
    navigate: (sessionId: string, url: string) =>
      invoke('browser:navigate', { sessionId, url }),
    execute: (sessionId: string, script: string) =>
      invoke('browser:execute', { sessionId, script }),
    close: (sessionId: string) =>
      invoke('browser:close', { sessionId }),
    list: () =>
      invoke('browser:list', {} as any),
    onConsole: createEventBridge({
      console: 'browser:console',
      navigation: 'browser:navigation',
      crash: 'browser:crash',
    }),
  },

  // Terminal
  terminal: {
    exec: (sessionId: string, command: string) =>
      invoke('terminal:exec', { sessionId, command }),
    resize: (sessionId: string, cols: number, rows: number) =>
      invoke('terminal:resize', { sessionId, cols, rows }),
    close: (sessionId: string) =>
      invoke('terminal:close', { sessionId }),
    list: () =>
      invoke('terminal:list', {} as any),
    onData: createEventBridge({
      data: 'terminal:data',
      exit: 'terminal:exit',
    }),
  },

  // Search
  search: {
    query: (q: string, engines?: string[], maxResults?: number) =>
      invoke('search:query', { q, engines, maxResults }),
  },

  // Chat
  chat: {
    send: (chatId: string, message: string, model?: string) =>
      invoke('chat:send', { chatId, message, model }),
    history: (chatId: string) =>
      invoke('chat:history', { chatId } as any),
  },

  // MCP
  mcp: {
    call: (serverId: string, method: string, params: unknown) =>
      invoke('mcp:call', { serverId, method, params }),
    list: () =>
      invoke('mcp:list', {} as any),
    stdio: {
      call: (serverId: string, method: string, params: unknown) =>
        invoke('mcp:stdio:call', { serverId, method, params }),
    },
  },

  // Clipboard
  clipboard: {
    read: () =>
      invoke('clipboard:read', {} as any),
    write: (text: string) =>
      invoke('clipboard:write', { text } as any),
    watch: (enabled: boolean) =>
      invoke('clipboard:watch', { enabled } as any),
    onChange: createEventBridge({
      change: 'clipboard:change',
    }),
  },

  // File Watcher
  watcher: {
    add: (path: string, recursive?: boolean) =>
      invoke('watcher:add', { path, recursive } as any),
    remove: (path: string) =>
      invoke('watcher:remove', { path } as any),
    list: () =>
      invoke('watcher:list', {} as any),
    onChange: createEventBridge({
      change: 'watcher:change',
    }),
  },

  // Power Management
  power: {
    assert: (type: 'prevent-sleep' | 'prevent-idle') =>
      invoke('power:assert', { type } as any),
    release: (type: 'prevent-sleep' | 'prevent-idle') =>
      invoke('power:release', { type } as any),
  },

  // Dialogs
  dialog: {
    show: (options: Electron.OpenDialogOptions | Electron.SaveDialogOptions | Electron.MessageBoxOptions) =>
      invoke('dialog:show', { options } as any),
  },

  // System Processes
  processes: {
    list: () =>
      invoke('processes:list', {} as any),
  },

  // Git
  git: {
    status: (repoPath: string) =>
      invoke('git:status', { repoPath } as any),
    diff: (repoPath: string, staged?: boolean) =>
      invoke('git:diff', { repoPath, staged } as any),
    commit: (repoPath: string, message: string) =>
      invoke('git:commit', { repoPath, message } as any),
  },

  // FS Watcher (granular)
  fsWatcher: {
    add: (path: string, events?: string[]) =>
      invoke('fs:watcher:add', { path, events } as any),
    remove: (path: string) =>
      invoke('fs:watcher:remove', { path } as any),
    onEvent: createEventBridge({
      event: 'fs:watcher:event',
    }),
  },

  // Companion Window
  companion: {
    show: (url: string, bounds?: { x: number; y: number; width: number; height: number }) =>
      invoke('companion:show', { url, bounds } as any),
    hide: () =>
      invoke('companion:hide', {} as any),
  },

  // Scheduler
  scheduler: {
    add: (id: string, cron: string, payload: unknown) =>
      invoke('scheduler:add', { id, cron, payload } as any),
    remove: (id: string) =>
      invoke('scheduler:remove', { id } as any),
    list: () =>
      invoke('scheduler:list', {} as any),
    onTrigger: createEventBridge({
      trigger: 'scheduler:trigger',
    }),
  },
} as const

contextBridge.exposeInMainWorld('yogatik', api)

// Type declaration for renderer
declare global {
  interface Window {
    yogatik: typeof api
  }
}