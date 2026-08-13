// Native application menu with real desktop shortcuts. Menu items that need
// app logic (New Chat, Settings, Grant Folder) send a 'menu' IPC event the
// renderer listens for; the rest use built-in Electron roles.

const { app, Menu, shell, dialog } = require('electron')

function buildMenu(win, opts = {}) {
  const send = (action) => { if (win && !win.isDestroyed()) win.webContents.send('menu', action) }
  const isMac = process.platform === 'darwin'
  const getRoot = opts.getRoot || (() => null)
  const login = app.getLoginItemSettings?.() || {}

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => send('new-chat') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { type: 'separator' },
        { label: 'Grant Working Folder…', accelerator: 'CmdOrCtrl+O', click: () => send('grant-folder') },
        {
          label: 'Open Working Folder',
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
            detail: `Version ${app.getVersion()}\n\nPrivate browser-native AI — local Ollama models, local-file editing, live web research and 65+ tools. Runs on your machine.`,
            buttons: ['OK'],
          }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { buildMenu }
