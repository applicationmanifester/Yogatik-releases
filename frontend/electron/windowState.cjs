// Remember the window's size/position/maximized state between launches.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

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
  const save = () => {
    clearTimeout(t)
    t = setTimeout(() => {
      try {
        const b = win.getBounds()
        fs.writeFileSync(file(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
      } catch { /* ignore */ }
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('close', save)
}

module.exports = { restore, track }
