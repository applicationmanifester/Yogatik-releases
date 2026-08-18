// Preload for the browser window's tab strip ONLY. Deliberately minimal: the
// tab strip is chrome, not the app, so it gets one channel and nothing else.
//
// Without this, the tab buttons would be inert — the same trap __YOGATIK_MENU__
// fell into, where the menu items dispatch an action nobody subscribes to.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__tabAction', (action, tabId) => {
  if (action !== 'close' && action !== 'select') return
  if (typeof tabId !== 'string') return
  ipcRenderer.send('browser:tab-action', { action, tabId })
})
