// Preload for Yogatik Browser chrome (toolbar + tab strip + command palette).

const { contextBridge, ipcRenderer } = require('electron')

const TAB_ID_ACTIONS = new Set(['close', 'select', 'cancel-download', 'open-download', 'show-download', 'toggle-mute', 'toggle-pin', 'new-tab-group', 'toggle-vertical-tabs', 'collapse-sidebar', 'rename-tab-group', 'delete-tab-group'])
const VALID_ACTIONS = new Set([
  'close', 'select', 'new-tab', 'back', 'forward', 'reload', 'navigate',
  'zoom', 'find', 'find-stop', 'cancel-download', 'open-download', 'show-download',
  'pip', 'toggle-mute', 'toggle-pin', 'toggle-split', 'toggle-shield', 'toggle-ai-panel', 'ai-query', 'send-to-main-chat',
  'toggle-reader', 'screenshot', 'theme', 'cmd-action',
  'new-tab-group', 'toggle-vertical-tabs', 'collapse-sidebar', 'rename-tab-group', 'delete-tab-group',
])

contextBridge.exposeInMainWorld('__tabAction', (action, value) => {
  if (!VALID_ACTIONS.has(action)) return
  const payload = { action }
  if (TAB_ID_ACTIONS.has(action)) {
    if (typeof value !== 'string') return
    payload.tabId = value
    payload.arg = value
  } else if (action === 'navigate' || action === 'zoom' || action === 'theme') {
    if (typeof value !== 'string' || !value.trim()) return
    payload.arg = value
  } else if (action === 'find' || action === 'ai-query' || action === 'send-to-main-chat' || action === 'cmd-action') {
    if (!value || typeof value !== 'object') return
    payload.arg = value
  }
  ipcRenderer.send('browser:tab-action', payload)
})

contextBridge.exposeInMainWorld('__settings', {
  get: (key) => ipcRenderer.invoke('settings:get', key),
  set: (key, val) => ipcRenderer.invoke('settings:set', key, val),
  all: () => ipcRenderer.invoke('settings:all'),
})

// AI engine state — local Ollama / cloud endpoint / offline templates.
contextBridge.exposeInMainWorld('__aiStatus', () => ipcRenderer.invoke('browser:ai-status'))

// Scheduled page monitoring.
contextBridge.exposeInMainWorld('__monitor', {
  add: (opts) => ipcRenderer.invoke('browser:monitor-add', opts),
  remove: (id) => ipcRenderer.invoke('browser:monitor-remove', { id }),
  list: () => ipcRenderer.invoke('browser:monitor-list'),
})

// Encrypted profile backup (sync-free E2E).
contextBridge.exposeInMainWorld('__backup', {
  export: (password) => ipcRenderer.invoke('browser:backup-export', { password }),
  import: (password) => ipcRenderer.invoke('browser:backup-import', { password }),
})

// Download actions are whitelisted — never forward arbitrary action strings.
const DOWNLOAD_ACTIONS = new Set(['cancel-download', 'open-download', 'show-download'])

contextBridge.exposeInMainWorld('__downloadAction', (action, id) => {
  if (!DOWNLOAD_ACTIONS.has(action)) return
  if (typeof id !== 'string') return
  ipcRenderer.send('browser:tab-action', { action, arg: id, tabId: id })
})

// [page-pipeline] Page-as-Context AI pipeline — same whitelist discipline as
// DOWNLOAD_ACTIONS: the renderer may only name the three pipeline actions, and
// main.cjs enforces the SAME set again on its side (a renderer-side whitelist
// alone is not a whitelist). Page text is never a payload the renderer sends;
// the main process grabs it from the sender's own session.
const PAGE_PIPELINE_ACTIONS = new Set(['ask-yogatik-selection', 'export-page-pdf', 'get-selection'])

contextBridge.exposeInMainWorld('__pagePipeline', (action, payload) => {
  if (!PAGE_PIPELINE_ACTIONS.has(action)) {
    return Promise.resolve({ success: false, error: 'Unknown page-pipeline action' })
  }
  if (payload != null && typeof payload !== 'object') {
    return Promise.resolve({ success: false, error: 'Invalid page-pipeline payload' })
  }
  return ipcRenderer.invoke('browser:page-pipeline', { action, payload: payload || {} })
})

// [chromium-privacy] Privacy stack bridge — container tabs + storage audit.
// Same discipline as DOWNLOAD_ACTIONS: ids and origins are always strings,
// and main.cjs re-validates both on its side (a renderer-side check alone is
// not a check). No other surface may name these channels.
contextBridge.exposeInMainWorld('__privacy', {
  containers: {
    list: () => ipcRenderer.invoke('privacy:containers-list'),
    create: (id, label) => ipcRenderer.invoke('privacy:containers-create', {
      id: typeof id === 'string' ? id : '',
      label: typeof label === 'string' ? label : undefined,
    }),
    open: (id, url) => ipcRenderer.invoke('privacy:containers-open', {
      id: typeof id === 'string' ? id : '',
      url: typeof url === 'string' && url.trim() ? url : undefined,
    }),
  },
  storageAudit: () => ipcRenderer.invoke('privacy:storage-audit'),
  wipeOrigin: (origin) => ipcRenderer.invoke('privacy:wipe-origin', {
    origin: typeof origin === 'string' ? origin : '',
  }),
})
