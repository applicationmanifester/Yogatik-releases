/**
 * IPC channel names shared between the main process and the preload bridge.
 * Kept in a leaf module with no electron imports so both sides can type-check
 * against the same list without circular dependencies.
 */

export const IPC_COMMANDS = [
  // Existing channels
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
  // Desktop system APIs (from the refactor)
  'desktop:isAlwaysOnTop',
  'desktop:toggleAlwaysOnTop',
  'desktop:getSystemInfo',
  'desktop:showItemInFolder',
  'desktop:openPath',
  'desktop:openExternal',
  'desktop:eval-js',
  'local-search',
  'auth:google-desktop',
  'desktop:captureScreen',
  'desktop:getActiveWindow',
  'desktop:setCompanionMode',
  'desktop:executeAction',
  'desktop:getAiCapabilities',
] as const

export type IpcCommand = (typeof IPC_COMMANDS)[number]

/** Payload shapes per channel, loosely typed until handlers adopt strict DTOs. */
export interface IpcContracts {
  'fs:read': { path: string; maxBytes?: number; offset?: number; limit?: number }
  'fs:write': { path: string; content: string; expectedHash?: string; keepEol?: boolean }
  'fs:edit': { path: string; edits: Array<{ oldText: string; newText: string }>; expectedHash?: string }
  'fs:search': { pattern: string; root: string; include?: string[]; exclude?: string[]; maxResults?: number }
  'proc:start': { chatId: string; command: string; cwd: string; env?: Record<string, string> }
  'proc:read': { id: string; offset?: number }
  'proc:kill': { id: string; signal?: string }
  'proc:list': { chatId?: string }
  'browser:create': { url: string; mode: 'panel' | 'window'; bounds?: { x: number; y: number; width: number; height: number } }
  'browser:navigate': { sessionId: string; url: string }
  'browser:execute': { sessionId: string; script: string }
  'browser:close': { sessionId: string }
  'browser:list': Record<string, never>
  'terminal:exec': { sessionId?: string; ctx?: string; command?: string; cwd?: string; timeout?: number; env?: Record<string, string>; shell?: string }
  'terminal:resize': { sessionId: string; cols: number; rows: number }
  'terminal:close': { sessionId: string }
  'terminal:list': Record<string, never>
  'search:query': { q: string; engines?: string[]; maxResults?: number }
  'chat:send': { chatId: string; message: string; model?: string }
  'chat:history': { chatId: string }
  'mcp:call': { serverId: string; method: string; params: unknown }
  'mcp:list': Record<string, never>
  'clipboard:read': Record<string, never>
  'clipboard:write': { text: string }
  'clipboard:watch': { enabled: boolean }
  'watcher:add': { path: string; recursive?: boolean }
  'watcher:remove': { path: string }
  'watcher:list': Record<string, never>
  'power:assert': { type: 'prevent-sleep' | 'prevent-idle' }
  'power:release': { type: 'prevent-sleep' | 'prevent-idle' }
  'dialog:show': { options: unknown }
  'processes:list': Record<string, never>
  'git:status': { repoPath: string }
  'git:diff': { repoPath: string; staged?: boolean }
  'git:commit': { repoPath: string; message: string }
  'fs:watcher:add': { path: string; events?: string[] }
  'fs:watcher:remove': { path: string }
  'mcp:stdio:call': { serverId: string; method: string; params: unknown }
  'companion:show': { url: string; bounds?: { x: number; y: number; width: number; height: number } }
  'companion:hide': Record<string, never>
  'scheduler:add': { id: string; cron: string; payload: unknown }
  'scheduler:remove': { id: string }
  'scheduler:list': Record<string, never>
  'desktop:isAlwaysOnTop': Record<string, never>
  'desktop:toggleAlwaysOnTop': { flag?: boolean }
  'desktop:getSystemInfo': Record<string, never>
  'desktop:showItemInFolder': { path: string }
  'desktop:openPath': { path: string }
  'desktop:openExternal': { url: string }
  'desktop:eval-js': { code: string; timeoutMs?: number }
  'local-search': { query: string; options?: { count?: number; recency?: string; engines?: string; site?: string } }
  'auth:google-desktop': Record<string, never>
  'desktop:captureScreen': Record<string, never>
  'desktop:getActiveWindow': Record<string, never>
  'desktop:setCompanionMode': { enable?: boolean }
  'desktop:executeAction': { action: { type: string; text?: string; keys?: string; targetUrl?: string; targetApp?: string } }
  'desktop:getAiCapabilities': { force?: boolean }
}