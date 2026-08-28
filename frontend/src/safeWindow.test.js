// The crash this pins:
//
//   A JavaScript error occurred in the main process
//   TypeError: Object has been destroyed
//       at EventEmitter.<anonymous> (…/electron/main.cjs:119:22)
//       at EventEmitter.emit (node:events:509:28)
//
// Seen right after installing. `EventEmitter.emit` is the tell: an autoUpdater
// event landed after the window was gone, and updater.cjs reached
// `win.webContents` behind nothing but `if (win)`.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)
const { alive, safeSend, safeWin } = require_('../electron/safeWindow.cjs')

/** A window whose native object is gone: EVERY property access throws, which
 *  is exactly how Electron behaves and what a plain mock would not reproduce. */
const destroyedWindow = () => new Proxy({}, {
  get() { throw new TypeError('Object has been destroyed') },
})

/** The nastier case: the WINDOW is alive but its webContents is not. These are
 *  separate native objects and the webContents is torn down first, so there is
 *  a real interval where `!win.isDestroyed()` is true and the send still dies. */
const halfDeadWindow = () => ({
  isDestroyed: () => false,
  get webContents() { throw new TypeError('Object has been destroyed') },
})

const liveWindow = () => {
  const sent = []
  return {
    sent,
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (...a) => sent.push(a) },
  }
}

describe('alive()', () => {
  it('is false for a destroyed window instead of throwing', () => {
    expect(() => alive(destroyedWindow())).not.toThrow()
    expect(alive(destroyedWindow())).toBe(false)
  })

  it('is false when only the webContents is gone', () => {
    // THE ACTUAL BUG. `if (win && !win.isDestroyed())` passes here and the very
    // next property read throws.
    const w = halfDeadWindow()
    expect(w.isDestroyed()).toBe(false)
    expect(alive(w)).toBe(false)
  })

  it('is false for null/undefined, true for a real window', () => {
    expect(alive(null)).toBe(false)
    expect(alive(undefined)).toBe(false)
    expect(alive(liveWindow())).toBe(true)
  })
})

describe('safeSend()', () => {
  it('delivers to a live window and reports it', () => {
    const w = liveWindow()
    expect(safeSend(w, 'menu', 'update-ready')).toBe(true)
    expect(w.sent).toEqual([['menu', 'update-ready']])
  })

  it('never throws for a destroyed or half-dead window', () => {
    for (const w of [destroyedWindow(), halfDeadWindow(), null, undefined]) {
      expect(() => safeSend(w, 'menu', 'x')).not.toThrow()
      expect(safeSend(w, 'menu', 'x')).toBe(false)
    }
  })

  it('survives a window destroyed BETWEEN the check and the send', () => {
    // One tick during quit. The isDestroyed() guard passes, then send() throws.
    const w = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send() { throw new TypeError('Object has been destroyed') },
      },
    }
    expect(() => safeSend(w, 'menu', 'x')).not.toThrow()
    expect(safeSend(w, 'menu', 'x')).toBe(false)
  })
})

describe('safeWin()', () => {
  it('runs against a live window and skips a dead one', () => {
    expect(safeWin(liveWindow(), () => 'ran')).toBe('ran')
    expect(safeWin(destroyedWindow(), () => 'ran')).toBeUndefined()
    expect(() => safeWin(destroyedWindow(), w => w.show())).not.toThrow()
  })
})

describe('no caller reaches webContents unguarded', () => {
  const ELECTRON = path.join(HERE, '..', 'electron')
  const files = fs.readdirSync(ELECTRON).filter(f => f.endsWith('.cjs'))

  it('every .webContents.send in electron/ goes through safeSend', () => {
    // A grep-level guard, because this bug is not a logic error anyone reasons
    // their way into — it is a habit. `win.webContents.send(...)` reads as
    // obviously fine and is a crash during teardown.
    const offenders = []
    for (const f of files) {
      if (f === 'safeWindow.cjs') continue
      const src = fs.readFileSync(path.join(ELECTRON, f), 'utf8')
      for (const line of src.split('\n')) {
        if (!/\.webContents\.send\(/.test(line)) continue
        if (/safeSend\(/.test(line)) continue
        offenders.push(`${f}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('main.cjs installs the uncaught-exception guard', () => {
    // Electron's default for an uncaught throw in main is a modal dialog and a
    // dead app — which, firing during first launch, is the first thing a new
    // user sees. A teardown race must never be able to do that.
    const src = fs.readFileSync(path.join(ELECTRON, 'main.cjs'), 'utf8')
    expect(src).toMatch(/process\.on\('uncaughtException'/)
    expect(src).toMatch(/Object has been destroyed/)
    // ...but it must NOT swallow everything: a real bug still has to surface.
    expect(src).toMatch(/setImmediate\(\(\) => \{ throw err \}\)/)
  })
})
