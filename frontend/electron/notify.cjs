// Native OS notifications. The renderer calls window.__YOGATIK_NOTIFY__(title,
// body) (e.g. when a long task finishes while the window is in the background).

const { ipcMain, Notification } = require('electron')
const path = require('path')

function registerNotifications(getWindow) {
  ipcMain.handle('notify', (_e, { title, body } = {}) => {
    if (!Notification.isSupported()) return false
    const n = new Notification({
      title: title || 'Yogatik',
      body: body || '',
      icon: path.join(__dirname, '..', 'src-tauri', 'icons', '128x128.png'),
      silent: false,
    })
    n.on('click', () => {
      const win = getWindow()
      if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
    })
    n.show()
    return true
  })
}

module.exports = { registerNotifications }
