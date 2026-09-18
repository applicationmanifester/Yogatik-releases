// Preload for Yogatik Browser chrome (toolbar + tab strip + command palette).

const { contextBridge, ipcRenderer } = require('electron')

const TAB_ID_ACTIONS = new Set(['close', 'select', 'cancel-download', 'open-download', 'show-download', 'toggle-mute'])
const VALID_ACTIONS = new Set([
  'close', 'select', 'new-tab', 'back', 'forward', 'reload', 'navigate',
  'zoom', 'find', 'find-stop', 'cancel-download', 'open-download', 'show-download',
  'pip', 'toggle-mute', 'toggle-shield', 'toggle-ai-panel', 'ai-query', 'send-to-main-chat',
  'toggle-reader', 'screenshot', 'theme', 'cmd-action',
])

contextBridge.exposeInMainWorld('__tabAction', (action, value) => {
  if (!VALID_ACTIONS.has(action)) return
  const payload = { action }
  if (TAB_ID_ACTIONS.has(action)) {
    if (typeof value !== 'string') return
    payload.tabId = value
  } else if (action === 'navigate' || action === 'zoom' || action === 'theme') {
    if (typeof value !== 'string' || !value.trim()) return
    payload.arg = value
  } else if (action === 'find' || action === 'ai-query' || action === 'send-to-main-chat' || action === 'cmd-action') {
    if (!value || typeof value !== 'object') return
    payload.arg = value
  }
  ipcRenderer.send('browser:tab-action', payload)
})
