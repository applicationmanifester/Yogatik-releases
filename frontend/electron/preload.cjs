// Preload bridge. Exposes the same window.__TAURI__.core.invoke shape the Tauri
// shell uses, so the renderer's tools/localFs.js (isDesktop() + invoke) works
// identically under Electron with zero frontend changes.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const FS_COMMANDS = new Set([
  'fs_grant', 'fs_granted_root', 'fs_clear_grant',
  'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_search', 'fs_find_files',
  'fs_delete', 'fs_mkdir', 'fs_move', 'fs_batch_read', 'fs_file_tree',
  // A handler that is not named here is rejected as "Unknown command" — which
  // is exactly how fs_find_files shipped with a tool, five aliases and no way
  // to reach it. Every new fs_* handler must be added on this line.
  'fs_multi_edit', 'fs_stat', 'fs_copy',
  'roots_add', 'roots_list', 'roots_remove', 'roots_set_primary', 'roots_rebind',
  'journal_list', 'journal_revert',
  'proc_start', 'proc_output', 'proc_stop', 'proc_list',
  'hooks_run', 'hooks_list', 'hooks_trust', 'hooks_trusted',
  'git_run', 'git_status', 'git_log', 'git_diff',
  'watch_start', 'watch_stop', 'watch_changes',
  'mcp_stdio_start', 'mcp_stdio_call', 'mcp_stdio_stop', 'mcp_stdio_list',
])

function invoke(cmd, args) {
  if (!FS_COMMANDS.has(cmd)) return Promise.reject(new Error(`Unknown command: ${cmd}`))
  return ipcRenderer.invoke(cmd, args ?? {})
}

contextBridge.exposeInMainWorld('__TAURI__', { core: { invoke } })
// Marker so the renderer can tell it's the Electron build if it ever needs to.
contextBridge.exposeInMainWorld('__YOGATIK_ELECTRON__', true)

// Desktop native system controls (Always on top, Explorer reveal, system hardware specs)
contextBridge.exposeInMainWorld('__YOGATIK_DESKTOP__', {
  isAlwaysOnTop: () => ipcRenderer.invoke('desktop:isAlwaysOnTop'),
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('desktop:toggleAlwaysOnTop', flag),
  getSystemInfo: () => ipcRenderer.invoke('desktop:getSystemInfo'),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('desktop:showItemInFolder', fullPath),
  openPath: (fullPath) => ipcRenderer.invoke('desktop:openPath', fullPath),
  openExternal: (url) => ipcRenderer.invoke('desktop:openExternal', url),
  loginWithGoogle: () => ipcRenderer.invoke('auth:google-desktop'),
})

// Desktop AI Companion & Screen-Watcher bridge
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION__', {
  captureScreen: () => ipcRenderer.invoke('desktop:captureScreen'),
  getActiveWindow: () => ipcRenderer.invoke('desktop:getActiveWindow'),
  setCompanionMode: (enable) => ipcRenderer.invoke('desktop:setCompanionMode', enable),
  executeAction: (action) => ipcRenderer.invoke('desktop:executeAction', action),
  onToggleHotkey: (cb) => {
    const handler = () => { try { cb() } catch { /* ignore */ } }
    ipcRenderer.on('toggle-companion-hotkey', handler)
    return () => ipcRenderer.removeListener('toggle-companion-hotkey', handler)
  },
  onModeChanged: (cb) => {
    const handler = (_e, active) => { try { cb(active) } catch { /* ignore */ } }
    ipcRenderer.on('companion-mode-changed', handler)
    return () => ipcRenderer.removeListener('companion-mode-changed', handler)
  },
})

// Precise cross-app input for the companion (mouse click/move/scroll, keys).
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION_INPUT__', {
  move: (x, y) => ipcRenderer.invoke('companion:move', { x, y }),
  click: (opts) => ipcRenderer.invoke('companion:click', opts || {}),
  scroll: (amount) => ipcRenderer.invoke('companion:scroll', { amount }),
  key: (combo) => ipcRenderer.invoke('companion:key', combo),
})

// Local search sidecar bridge
contextBridge.exposeInMainWorld('__YOGATIK_SEARCH__', {
  search: (query, options) => ipcRenderer.invoke('local-search', query, options),
})

// Terminal execution bridge for local shell commands
contextBridge.exposeInMainWorld('__YOGATIK_TERMINAL__', {
  exec: (command, options) => ipcRenderer.invoke('terminal:exec', { command, ...options }),
})

// Native-menu actions (New Chat / Settings / Grant Folder / update-ready / palette / arena) → renderer.
contextBridge.exposeInMainWorld('__YOGATIK_MENU__', {
  on(cb) {
    const handler = (_e, action) => { try { cb(action) } catch { /* ignore */ } }
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
})

// Fire a native OS notification. Accepts either the legacy (title, body) form or
// a single rich-options object { title, body, actions, hasReply, silent }.
contextBridge.exposeInMainWorld('__YOGATIK_NOTIFY__', (titleOrOpts, body) =>
  ipcRenderer.invoke('notify',
    typeof titleOrOpts === 'object' && titleOrOpts !== null
      ? titleOrOpts
      : { title: titleOrOpts, body }))

// Listen for rich-notification actions (button click / inline reply).
contextBridge.exposeInMainWorld('__YOGATIK_NOTIFY_ACTIONS__', {
  on(cb) {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('notification-action', handler)
    return () => ipcRenderer.removeListener('notification-action', handler)
  },
})

// OS-encrypted key vault (safeStorage). db.js wraps apikey_* settings through this.
contextBridge.exposeInMainWorld('__YOGATIK_KEYCHAIN__', {
  available: () => ipcRenderer.invoke('keychain:available'),
  encrypt: (plain) => ipcRenderer.invoke('keychain:encrypt', plain),
  decrypt: (value) => ipcRenderer.invoke('keychain:decrypt', value),
})

// Clipboard read + rolling history (browser can't read history or off-focus).
contextBridge.exposeInMainWorld('__YOGATIK_CLIPBOARD__', {
  read: () => ipcRenderer.invoke('clipboard:read'),
  write: (text) => ipcRenderer.invoke('clipboard:write', text),
  history: (limit) => ipcRenderer.invoke('clipboard:history', limit),
  clear: () => ipcRenderer.invoke('clipboard:clear'),
  onChange: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-changed', handler)
    return () => ipcRenderer.removeListener('clipboard-changed', handler)
  },
  // Ctrl+Alt+C sends the copied selection to the renderer as a ready prompt.
  onSelectionHotkey: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-selection-hotkey', handler)
    return () => ipcRenderer.removeListener('clipboard-selection-hotkey', handler)
  },
})

// File-system watcher (scoped to the granted folder).
contextBridge.exposeInMainWorld('__YOGATIK_WATCHER__', {
  start: (path, options) => ipcRenderer.invoke('watcher:start', { path, ...(options || {}) }),
  stop: (id) => ipcRenderer.invoke('watcher:stop', id),
  stopAll: () => ipcRenderer.invoke('watcher:stopAll'),
  list: () => ipcRenderer.invoke('watcher:list'),
  onChange: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('fs-changed', handler)
    return () => ipcRenderer.removeListener('fs-changed', handler)
  },
})

// Power / idle monitor.
contextBridge.exposeInMainWorld('__YOGATIK_POWER__', {
  getState: () => ipcRenderer.invoke('power:get-state'),
  onEvent: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('power-event', handler)
    return () => ipcRenderer.removeListener('power-event', handler)
  },
})

// Native file dialogs (real OS paths).
contextBridge.exposeInMainWorld('__YOGATIK_DIALOG__', {
  openFile: (opts) => ipcRenderer.invoke('dialog:open-file', opts || {}),
  openFiles: (opts) => ipcRenderer.invoke('dialog:open-files', opts || {}),
  saveFile: (opts) => ipcRenderer.invoke('dialog:save-file', opts || {}),
  pickFolder: (opts) => ipcRenderer.invoke('dialog:pick-folder', opts || {}),
  readPicked: (path) => ipcRenderer.invoke('dialog:read-picked', path),
})

// Real browser the agent can drive and the user can watch. Web builds have no
// equivalent — cross-origin iframes are refused and opaque.
contextBridge.exposeInMainWorld('__YOGATIK_BROWSER__', {
  navigate: (p) => ipcRenderer.invoke('browser:navigate', p || {}),
  read: (p) => ipcRenderer.invoke('browser:read', p || {}),
  click: (p) => ipcRenderer.invoke('browser:click', p || {}),
  type: (p) => ipcRenderer.invoke('browser:type', p || {}),
  key: (p) => ipcRenderer.invoke('browser:key', p || {}),
  scroll: (p) => ipcRenderer.invoke('browser:scroll', p || {}),
  screenshot: (p) => ipcRenderer.invoke('browser:screenshot', p || {}),
  newTab: (p) => ipcRenderer.invoke('browser:new-tab', p || {}),
  listTabs: (p) => ipcRenderer.invoke('browser:list-tabs', p || {}),
  selectTab: (p) => ipcRenderer.invoke('browser:select-tab', p || {}),
  closeTab: (p) => ipcRenderer.invoke('browser:close-tab', p || {}),
  history: (p) => ipcRenderer.invoke('browser:history', p || {}),
  setMode: (p) => ipcRenderer.invoke('browser:set-mode', p || {}),
  setBounds: (p) => ipcRenderer.invoke('browser:set-bounds', p || {}),
  setDetached: (p) => ipcRenderer.invoke('browser:set-detached', p || {}),
  close: (p) => ipcRenderer.invoke('browser:close', p || {}),
})

// The floating companion window (always-on-top mini assistant).
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION_WIN__', {
  toggle: () => ipcRenderer.invoke('companion:toggle'),
  show: () => ipcRenderer.invoke('companion:show'),
  hide: () => ipcRenderer.invoke('companion:hide'),
  close: () => ipcRenderer.invoke('companion:close'),
  resize: (p) => ipcRenderer.invoke('companion:resize', p || {}),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('companion:set-always-on-top', { on }),
  // Ctrl+Alt+C relays the foreground selection HERE when the companion is the
  // window on screen, so acting on a selection never means going back to the app.
  onSelection: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-selection-hotkey', handler)
    return () => ipcRenderer.removeListener('clipboard-selection-hotkey', handler)
  },
})

// Process manager (list + guarded kill).
contextBridge.exposeInMainWorld('__YOGATIK_PROCESS__', {
  list: (opts) => ipcRenderer.invoke('process:list', opts || {}),
  kill: (pid) => ipcRenderer.invoke('process:kill', pid),
})

// Interactive PTY terminal (no-op unless node-pty is installed).
contextBridge.exposeInMainWorld('__YOGATIK_PTY__', {
  available: () => ipcRenderer.invoke('pty:available'),
  spawn: (opts) => ipcRenderer.invoke('pty:spawn', opts || {}),
  write: (id, data) => ipcRenderer.invoke('pty:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  onData: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onExit: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },
})

// Local (stdio) MCP servers — spawn & talk to local MCP servers the browser
// can't reach. mcp.js routes transport:'stdio' entries through this.
contextBridge.exposeInMainWorld('__YOGATIK_MCP_STDIO__', {
  start: (opts) => ipcRenderer.invoke('mcp-stdio:start', opts || {}),
  rpc: (id, method, params) => ipcRenderer.invoke('mcp-stdio:rpc', { id, method, params }),
  notify: (id, method, params) => ipcRenderer.invoke('mcp-stdio:notify', { id, method, params }),
  stop: (id) => ipcRenderer.invoke('mcp-stdio:stop', id),
})

// Real OS path for a File dropped onto the window (web gives only opaque blobs).
contextBridge.exposeInMainWorld('__YOGATIK_DND__', {
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  },
})

// Scheduler/Cron Daemon bridge
contextBridge.exposeInMainWorld('__YOGATIK_SCHEDULER__', {
  // Job management
  getJobs: () => ipcRenderer.invoke('scheduler:get-jobs'),
  createJob: (jobData) => ipcRenderer.invoke('scheduler:create-job', jobData),
  updateJob: (id, updates) => ipcRenderer.invoke('scheduler:update-job', { id, updates }),
  deleteJob: (id) => ipcRenderer.invoke('scheduler:delete-job', id),
  toggleJob: (id) => ipcRenderer.invoke('scheduler:toggle-job', id),
  runJobNow: (id) => ipcRenderer.invoke('scheduler:run-now', id),
  parseSchedule: (natural) => ipcRenderer.invoke('scheduler:parse-schedule', natural),
  getJobLogs: (id) => ipcRenderer.invoke('scheduler:get-job-logs', id),
  
  // Listen for job execution requests from main process
  onExecuteJob: (cb) => {
    const handler = (_e, data) => { try { cb(data) } catch { /* ignore */ } }
    ipcRenderer.on('scheduler:execute-job', handler)
    return () => ipcRenderer.removeListener('scheduler:execute-job', handler)
  },
  
  // Send job result back to main
  sendJobResult: (channel, result) => ipcRenderer.send(channel, result),
})

// Sub-Agent Runner bridge
contextBridge.exposeInMainWorld('__YOGATIK_SUBAGENT__', {
  spawn: (agentId, config) => ipcRenderer.invoke('subagent:spawn', { agentId, config }),
  execute: (agentId, task, options) => ipcRenderer.invoke('subagent:execute', { agentId, task, options }),
  status: (agentId) => ipcRenderer.invoke('subagent:status', agentId),
  list: () => ipcRenderer.invoke('subagent:list'),
  kill: (agentId) => ipcRenderer.invoke('subagent:kill', agentId),
  
  // Python RPC
  python: {
    execute: (agentId, code, files) => ipcRenderer.invoke('subagent:python:execute', { agentId, code, files }),
    install: (agentId, packages) => ipcRenderer.invoke('subagent:python:install', { agentId, packages }),
    reset: (agentId) => ipcRenderer.invoke('subagent:python:reset', agentId),
    namespace: (agentId) => ipcRenderer.invoke('subagent:python:namespace', agentId),
  }
})
