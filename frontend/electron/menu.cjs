// Native application menu with real desktop shortcuts. Menu items that need
// app logic (New Chat, Settings, Grant Folder, Search, Arena) send a 'menu' IPC
// event the renderer listens for; the rest use built-in Electron roles.

const { app, Menu, shell, dialog } = require('electron')
const { safeSend, alive } = require('./safeWindow.cjs')

function buildMenu(win, opts = {}) {
  // isDestroyed() on the WINDOW is not enough — its webContents is a separate
  // object with its own lifetime and is torn down first.
  const send = (action) => safeSend(win, 'menu', action)
  const isMac = process.platform === 'darwin'
  const getRoot = opts.getRoot || (() => null)
  const login = app.getLoginItemSettings?.() || {}

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => send('new-chat') },
        { label: 'Universal Search & Commands', accelerator: 'CmdOrCtrl+K', click: () => send('open-palette') },
        { label: 'Model Arena (Compare Mode)', accelerator: 'CmdOrCtrl+Shift+A', click: () => send('open-arena') },
        { label: 'Live Voice Mode', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('open-live') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { label: 'Error Findings & Diagnostics', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('open-diagnostics') },
        { type: 'separator' },
        { label: 'Grant Working Folder…', accelerator: 'CmdOrCtrl+O', click: () => send('grant-folder') },
        {
          label: 'Open Working Folder in Explorer',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => { const r = getRoot(); if (r) shell.openPath(r); else send('grant-folder') },
        },
        { type: 'separator' },
        {
          label: 'Launch at Login',
          type: 'checkbox',
          checked: !!login.openAtLogin,
          click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+Shift+T',
          checked: win ? win.isAlwaysOnTop() : false,
          click: (item) => {
            if (win && !win.isDestroyed()) {
              const next = item.checked
              win.setAlwaysOnTop(next)
              send({ type: 'always-on-top-changed', value: next })
            }
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Yogatik on the Web', click: () => shell.openExternal('https://yogatik.web.app') },
        { label: 'Get Ollama (local models)', click: () => shell.openExternal('https://ollama.com/download') },
        { label: 'Check for Updates…', click: () => (opts.onCheckUpdates || (() => {}))() },
        { type: 'separator' },
        {
          label: 'About Yogatik',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'About Yogatik',
            message: `Yogatik Desktop`,
            detail: `Version ${app.getVersion()}\n\nPrivate desktop AI — local Ollama models, local-file editing, live web research and 65+ tools. Runs on your machine with scoped permissions.`,
            buttons: ['OK'],
          }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { buildMenu }
