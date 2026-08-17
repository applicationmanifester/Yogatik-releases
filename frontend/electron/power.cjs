// Power / idle monitor — unavailable in the browser. Surfaces suspend/resume,
// lock/unlock, AC/battery and system idle time to the renderer, and pauses the
// cron scheduler while the machine is asleep so jobs don't all fire at once on
// wake.
//
// Renderer bridge: window.__YOGATIK_POWER__.{getState,onEvent}
// Events: 'power-event' { event, at }

const { ipcMain, powerMonitor } = require('electron')

let onSuspend = null
let onResume = null

function getState() {
  let idleSeconds = 0
  let onBattery = false
  try { idleSeconds = powerMonitor.getSystemIdleTime() } catch { /* not ready */ }
  try { onBattery = powerMonitor.onBatteryPower } catch { /* platform */ }
  return { idleSeconds, onBattery, at: Date.now() }
}

// hooks: { pauseScheduler, resumeScheduler } — main wires the scheduler in.
function registerPower(getWindow, hooks = {}) {
  const relay = (event) => {
    const win = getWindow?.()
    if (win && !win.isDestroyed()) win.webContents.send('power-event', { event, at: Date.now() })
  }

  onSuspend = () => { try { hooks.pauseScheduler?.() } catch { /* ignore */ } relay('suspend') }
  onResume = () => { try { hooks.resumeScheduler?.() } catch { /* ignore */ } relay('resume') }

  try {
    powerMonitor.on('suspend', onSuspend)
    powerMonitor.on('resume', onResume)
    powerMonitor.on('lock-screen', () => relay('lock-screen'))
    powerMonitor.on('unlock-screen', () => relay('unlock-screen'))
    powerMonitor.on('on-ac', () => relay('on-ac'))
    powerMonitor.on('on-battery', () => relay('on-battery'))
  } catch { /* powerMonitor unavailable before app ready on some platforms */ }

  ipcMain.handle('power:get-state', () => ({ success: true, ...getState() }))
}

module.exports = { registerPower, getPowerState: getState }
