// Native OS notifications. The renderer calls window.__YOGATIK_NOTIFY__(title,
// body) (e.g. when a long task finishes while the window is in the background).
//
// Rich variant: pass { actions, hasReply } and listen for 'notification-action'
// { id, action, reply } — action buttons and inline reply work on macOS; on
// Windows the OS support is limited so it degrades to a plain click-to-focus.

const { ipcMain, Notification } = require('electron')
const path = require('path')

let notifSeq = 1

function registerNotifications(getWindow) {
  ipcMain.handle('notify', (_e, opts = {}) => {
    if (!Notification.isSupported()) return false
    const { title, body, actions, hasReply, silent } = opts
    const id = `n${notifSeq++}`

    const n = new Notification({
      title: title || 'Yogatik',
      body: body || '',
      icon: path.join(__dirname, '..', 'src-tauri', 'icons', '128x128.png'),
      silent: silent === true,
      hasReply: !!hasReply,
      actions: Array.isArray(actions)
        ? actions.slice(0, 3).map(a => ({ type: 'button', text: String(a) }))
        : undefined,
    })

    const send = (payload) => {
      const win = getWindow()
      if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
      if (win && !win.isDestroyed()) win.webContents.send('notification-action', { id, ...payload })
    }

    n.on('click', () => send({ action: 'click' }))
    n.on('action', (_ev, index) => send({ action: Array.isArray(actions) ? actions[index] : `action-${index}`, index }))
    n.on('reply', (_ev, reply) => send({ action: 'reply', reply }))
    n.show()
    return { id }
  })
}

module.exports = { registerNotifications }
