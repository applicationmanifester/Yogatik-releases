// System tray icon: quick access + keeps the app alive in the background.

const { app, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')

let tray = null

function createTray(getWindow) {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '..', 'src-tauri', 'icons', '32x32.png'),
  )
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Yogatik')

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
    { label: 'New Chat', click: () => { show(); sendMenuAction('new-chat') } },
    { type: 'separator' },
    { label: 'Settings', click: () => { show(); sendMenuAction('open-settings') } },
    { label: 'Grant Working Folder…', click: () => { show(); sendMenuAction('grant-folder') } },
    { type: 'separator' },
    { label: 'Check for Updates…', click: () => { show(); sendMenuAction('check-updates') } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('click', show)
  return tray
}

module.exports = { createTray }
