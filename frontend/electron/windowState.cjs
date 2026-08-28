// Remember the window's size/position/maximized state between launches.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { alive } = require('./safeWindow.cjs')

function file() { return path.join(app.getPath('userData'), 'window-state.json') }

function restore(defaults) {
  try {
    const s = JSON.parse(fs.readFileSync(file(), 'utf8'))
    return {
      width: s.width || defaults.width,
      height: s.height || defaults.height,
      x: s.x, y: s.y,
      maximized: !!s.maximized,
    }
  } catch {
    return { ...defaults, maximized: false }
  }
}

function track(win) {
  let t = null
  const save = (immediate = false) => {
    clearTimeout(t)
    const write = () => {
      // A 400ms debounce outlives the window on quit: this fires against a
      // destroyed object, where reading ANY property throws. The try/catch
      // below made it survivable, but it also meant the LAST size the user
      // chose was silently never saved.
      if (!alive(win)) return
      try {
        const b = win.getBounds()
        fs.writeFileSync(file(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
      } catch { /* a read-only userData is not worth crashing over */ }
    }
    if (immediate) write()
    else { t = setTimeout(write, 400); t.unref?.() }
  }
  win.on('resize', () => save())
  win.on('move', () => save())
  // On close, write SYNCHRONOUSLY and cancel the pending timer. Debouncing here
  // is what lost the final position — by the time the timer fired the window
  // was gone and the write was skipped.
  win.on('close', () => save(true))
}

module.exports = { restore, track }
