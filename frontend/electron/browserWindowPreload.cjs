// Preload for the browser window's chrome (toolbar + tab strip) ONLY.
// Deliberately minimal: this is chrome, not the app, so it gets one channel
// and nothing else.
//
// Without this, the toolbar's buttons, address bar and find/zoom/downloads
// controls would be inert — the same trap __YOGATIK_MENU__ fell into, where
// the menu items dispatch an action nobody subscribes to.

const { contextBridge, ipcRenderer } = require('electron')

// tabId-shaped actions carry a tab id string as `arg`; the rest carry
// whatever shape browser:tab-action's main-process switch expects for that
// action (a direction string, a find payload object, a download id, or
// nothing at all).
const TAB_ID_ACTIONS = new Set(['close', 'select', 'cancel-download', 'open-download', 'show-download', 'toggle-mute'])
const VALID_ACTIONS = new Set([
  'close', 'select', 'new-tab', 'back', 'forward', 'reload', 'navigate',
  'zoom', 'find', 'find-stop', 'cancel-download', 'open-download', 'show-download',
  'pip', 'toggle-mute',
])

contextBridge.exposeInMainWorld('__tabAction', (action, value) => {
  if (!VALID_ACTIONS.has(action)) return
  const payload = { action }
  if (TAB_ID_ACTIONS.has(action)) {
    if (typeof value !== 'string') return
    payload.tabId = value
  } else if (action === 'navigate' || action === 'zoom') {
    if (typeof value !== 'string' || !value.trim()) return
    payload.arg = value
  } else if (action === 'find') {
    if (!value || typeof value !== 'object') return
    payload.arg = { text: String(value.text || ''), forward: !!value.forward, findNext: !!value.findNext }
  }
  // 'find-stop' carries no argument at all.
  ipcRenderer.send('browser:tab-action', payload)
})
