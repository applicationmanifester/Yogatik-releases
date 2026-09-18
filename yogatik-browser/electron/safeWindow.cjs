// Safe access to a BrowserWindow that may already be gone.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CRASH THIS EXISTS FOR
//
//   A JavaScript error occurred in the main process
//   Uncaught Exception:
//   TypeError: Object has been destroyed
//       at EventEmitter.<anonymous> (…/electron/main.cjs:119:22)
//       at EventEmitter.emit (node:events:509:28)
//
// Electron's native objects throw "Object has been destroyed" the moment you
// touch ANY property of a destroyed window — including `.webContents`. So the
// idiom used all over this app:
//
//     if (win && !win.isDestroyed()) win.webContents.send(...)
//
// is NOT sufficient, and one caller (updater.cjs) did not even check that much:
// it fired on an autoUpdater EVENT — hence `EventEmitter.emit` in the stack —
// and reached `win.webContents` with a bare truthiness test.
//
// Two things have to be true, and they are different objects with independent
// lifetimes: the WINDOW must be alive, and its WEBCONTENTS must be alive. A
// window that is closing tears down its webContents first, so there is a real
// interval where `!win.isDestroyed()` is true and `win.webContents` throws.
//
// Worse, an uncaught throw in main has no recovery path: Electron shows that
// modal dialog and the app is dead. During a fresh INSTALL — when the updater
// is most likely to fire and the window is being created, shown and possibly
// relaunched — that dialog is the first thing a new user sees.

/** Is this window usable RIGHT NOW, webContents included? */
function alive(win) {
  try {
    if (!win) return false
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false
    // Reading .webContents is itself what throws on a destroyed window, so it
    // has to happen inside the try — checking it afterwards is too late.
    const wc = win.webContents
    if (!wc) return false
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return false
    return true
  } catch {
    // "Object has been destroyed" — which is the answer to the question.
    return false
  }
}

/**
 * Send to a window's renderer, or do nothing.
 * @returns {boolean} whether it was delivered — callers that need to know
 *          (the scheduler waits for a reply) can tell instead of hanging.
 */
function safeSend(win, channel, payload) {
  if (!alive(win)) return false
  try {
    win.webContents.send(channel, payload)
    return true
  } catch {
    // The window can be destroyed between the check and the send. This is not
    // a hypothetical: it is a single tick during quit, and it is exactly the
    // race that produced the crash dialog.
    return false
  }
}

/** Call a method on a window if it is alive. Returns undefined otherwise. */
function safeWin(win, fn) {
  if (!alive(win)) return undefined
  try { return fn(win) } catch { return undefined }
}

module.exports = { alive, safeSend, safeWin }
