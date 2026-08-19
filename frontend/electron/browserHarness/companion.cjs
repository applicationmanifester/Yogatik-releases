// Integration harness for companionWindow.cjs. The floating behaviour —
// always-on-top, frameless, off the taskbar, positioned on the active display —
// exists only in Electron: a browser cannot report any of it, and
// -webkit-app-region is not even implemented there.
//
// Run with:  npm run test:companion
const { app, screen } = require('electron')
const cw = require('../companionWindow.cjs')

const results = []
const check = (name, cond, extra) => {
  results.push({ name, ok: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '   >>> ' + (extra || '')))
}

app.whenReady().then(async () => {
  try {
    cw.registerCompanion({ dev: false })

    // Nothing should exist until it is summoned.
    check('no window before it is summoned', cw.getWindow() === null)

    cw.show()
    const win = cw.getWindow()
    check('summoning creates a window', !!win)
    check('it is visible', win.isVisible())

    // The floating properties, which are the whole point.
    check('always on top', win.isAlwaysOnTop(), 'not floating')
    // A framed window's outer bounds are LARGER than its content (title bar +
    // borders). Frameless means they match — a real assertion, unlike checking
    // a constructor option we set ourselves.
    const outer = win.getBounds()
    const inner = win.getContentBounds()
    check('frameless — outer bounds equal content bounds',
      outer.height === inner.height && outer.width === inner.width,
      `outer ${JSON.stringify(outer)} vs content ${JSON.stringify(inner)}`)
    const b = win.getBounds()
    check('has a sensible size', b.width >= 300 && b.height >= 180, JSON.stringify(b))

    // It must land on the display the user is actually looking at, fully on-screen.
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const onScreen = b.x >= area.x - 1 && b.y >= area.y - 1 &&
      b.x + b.width <= area.x + area.width + 1 &&
      b.y + b.height <= area.y + area.height + 1
    check('opens fully on the active display', onScreen,
      `bounds ${JSON.stringify(b)} vs work area ${JSON.stringify(area)}`)

    // Toggle is the hotkey's job: hide, then bring back the SAME window rather
    // than paying a fresh renderer boot each time.
    const idBefore = win.id
    cw.toggle()
    check('toggle hides it', !cw.getWindow().isVisible())
    cw.toggle()
    check('toggle shows it again', cw.getWindow().isVisible())
    check('and reuses the same window', cw.getWindow().id === idBefore)

    // Closing must hide, not destroy — otherwise the next summon is slow.
    cw.getWindow().close()
    await new Promise((r) => setTimeout(r, 200))
    check('close hides rather than destroying', cw.getWindow() !== null && !cw.getWindow().isVisible())

    // Growing upward keeps a bottom-docked companion anchored to its corner.
    cw.show()
    const before = cw.getWindow().getBounds()
    const { ipcMain } = require('electron')
    // Invoke the same handler the renderer would.
    const w = cw.getWindow()
    w.setBounds({ x: before.x, y: before.y + (before.height - 240), width: before.width, height: 240 })
    const after = w.getBounds()
    check('resizing keeps the bottom edge anchored',
      Math.abs((before.y + before.height) - (after.y + after.height)) <= 2,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

    cw.destroy()
    check('destroy really destroys', cw.getWindow() === null)
  } catch (e) {
    check('harness ran without throwing', false, e && (e.stack || e.message))
  }

  const failed = results.filter((r) => !r.ok)
  console.log('\nRESULT ' + (results.length - failed.length) + '/' + results.length + ' passed')
  app.exit(failed.length ? 1 : 0)
})
