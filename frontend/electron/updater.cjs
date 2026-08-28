
// Auto-update via electron-updater. Fully guarded: if the module is missing or
// no publish config exists, it no-ops instead of crashing the app.

const { safeSend, alive } = require('./safeWindow.cjs')

function initAutoUpdate(getWindow) {
  let autoUpdater
  try { ({ autoUpdater } = require('electron-updater')) } catch { return }

  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', (info) => {
    // `if (win)` was not enough: an autoUpdater event can land after the
    // window is destroyed (quit, relaunch-after-install), and reading
    // `.webContents` on a destroyed window THROWS. Uncaught in main, that
    // becomes the "A JavaScript error occurred in the main process" dialog —
    // the first thing a new user saw after installing.
    safeSend(getWindow && getWindow(), 'menu', 'update-ready')
    // Install on next launch; electron-updater prompts via checkForUpdatesAndNotify.
    try { new (require('electron').Notification)({ title: 'Yogatik update ready', body: `Version ${info?.version || ''} will install on restart.` }).show() } catch { /* ignore */ }
  })
  autoUpdater.on('error', () => { /* offline / no release yet — ignore */ })

  // Check shortly after startup so it never blocks first paint.
  setTimeout(() => {
    try { autoUpdater.checkForUpdatesAndNotify() } catch { /* ignore */ }
  }, 4000)
}

// Manual "Check for Updates…" from the menu — reports the result to the user.
function checkForUpdates(getWindow) {
  let autoUpdater
  try { ({ autoUpdater } = require('electron-updater')) } catch { return }
  const { dialog } = require('electron')
  // Resolved LATE, when the dialog is actually shown: a window captured now
  // may be gone by the time the check comes back over the network.
  const win = () => { const w = getWindow && getWindow(); return alive(w) ? w : undefined }
  autoUpdater.once('update-not-available', () => {
    try { dialog.showMessageBox(win(), { type: 'info', message: 'You’re up to date.', buttons: ['OK'] }) } catch { /* ignore */ }
  })
  autoUpdater.once('update-available', (info) => {
    try { dialog.showMessageBox(win(), { type: 'info', message: `Update available: v${info?.version || ''}`, detail: 'It will download in the background and install on restart.', buttons: ['OK'] }) } catch { /* ignore */ }
  })
  try { autoUpdater.checkForUpdates() } catch { /* offline / unconfigured */ }
}

module.exports = { initAutoUpdate, checkForUpdates }
