// System tray icon: quick access + keeps the app alive in the background.

const { app, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')

let tray = null

function createTray(getWindow, { onToggleCompanion } = {}) {
  const icon = nativeImage.createFromPath(
    // electron/icon.ico is the only icon that both EXISTS and is shipped:
    // build.files covers electron/** but never src-tauri/**, and that
    // directory is absent entirely — the tray showed a blank square.
    path.join(__dirname, 'icon.ico'),
  )
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Yogatik Desktop AI')

  const sendMenuAction = (action) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('menu', action)
  }

  const show = () => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Open Yogatik', click: show },
    // The floating companion is the surface that follows the user OUT of the
    // app, so it must be reachable without the app being open — the hotkey
    // alone is not discoverable.
    ...(onToggleCompanion
      ? [{ label: 'Floating Companion\tCtrl+Shift+Space', click: () => onToggleCompanion() }]
      : []),
    { label: 'New Chat', click: () => { show(); sendMenuAction('new-chat') } },
    { label: 'Universal Search & Commands', click: () => { show(); sendMenuAction('open-palette') } },
    { label: 'Model Arena (Compare Mode)', click: () => { show(); sendMenuAction('open-arena') } },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: getWindow() ? getWindow().isAlwaysOnTop() : false,
      click: (item) => {
        const win = getWindow()
        if (win && !win.isDestroyed()) {
          win.setAlwaysOnTop(item.checked)
          sendMenuAction({ type: 'always-on-top-changed', value: item.checked })
        }
      },
    },
    { label: 'Settings', click: () => { show(); sendMenuAction('open-settings') } },
    { label: 'Error Diagnostics', click: () => { show(); sendMenuAction('open-diagnostics') } },
    { label: 'Grant Working Folder…', click: () => { show(); sendMenuAction('grant-folder') } },
    { type: 'separator' },
    { label: 'Check for Updates…', click: () => { show(); sendMenuAction('check-updates') } },
    { type: 'separator' },
    { label: 'Quit Yogatik', click: () => { app.isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(menu)
  tray.on('click', show)
  return tray
}

module.exports = { createTray }
