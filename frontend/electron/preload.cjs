// Preload bridge. Exposes the same window.__TAURI__.core.invoke shape the Tauri
// shell uses, so the renderer's tools/localFs.js (isDesktop() + invoke) works
// identically under Electron with zero frontend changes.

const { contextBridge, ipcRenderer } = require('electron')

const FS_COMMANDS = new Set([
  'fs_grant', 'fs_granted_root', 'fs_clear_grant',
  'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_search',
  'fs_delete', 'fs_mkdir', 'fs_move',
])

function invoke(cmd, args) {
  if (!FS_COMMANDS.has(cmd)) return Promise.reject(new Error(`Unknown command: ${cmd}`))
  return ipcRenderer.invoke(cmd, args ?? {})
}

contextBridge.exposeInMainWorld('__TAURI__', { core: { invoke } })
// Marker so the renderer can tell it's the Electron build if it ever needs to.
contextBridge.exposeInMainWorld('__YOGATIK_ELECTRON__', true)

// Local search sidecar bridge
contextBridge.exposeInMainWorld('__YOGATIK_SEARCH__', {
  search: (query, options) => ipcRenderer.invoke('local-search', query, options),
})

// Terminal execution bridge for local shell commands
contextBridge.exposeInMainWorld('__YOGATIK_TERMINAL__', {
  exec: (command, options) => ipcRenderer.invoke('terminal:exec', { command, ...options }),
})

// Native-menu actions (New Chat / Settings / Grant Folder / update-ready) → renderer.
contextBridge.exposeInMainWorld('__YOGATIK_MENU__', {
  on(cb) {
    const handler = (_e, action) => { try { cb(action) } catch { /* ignore */ } }
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
})

// Fire a native OS notification (used when a reply lands while the app is hidden).
contextBridge.exposeInMainWorld('__YOGATIK_NOTIFY__', (title, body) =>
  ipcRenderer.invoke('notify', { title, body }))

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
