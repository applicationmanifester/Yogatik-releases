/**
 * On-device error log — a capped ring buffer of the last N runtime errors and
 * unhandled promise rejections, kept in localStorage. No backend, no telemetry
 * leaves the device; it exists so a user (or you, from a screenshot) can see
 * what actually broke instead of debugging blind.
 */
const KEY = 'yogatik.errorlog'
const MAX = 50

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch { /* full / private */ }
}

export function logError(kind, message, stack) {
  const entry = { kind, message: String(message || '').slice(0, 500), stack: String(stack || '').slice(0, 1500), at: Date.now() }
  write([...read(), entry])
  return entry
}
export function getErrorLog() { return read() }
export function clearErrorLog() { write([]) }

/** Attach global handlers once. Ignores noisy cross-origin "Script error." */
export function installErrorLog() {
  if (typeof window === 'undefined' || window.__yogatikErrLog) return
  window.__yogatikErrLog = true
  window.addEventListener('error', (e) => {
    if (e?.message === 'Script error.' && !e.filename) return   // opaque cross-origin
    logError('error', e?.message || 'error', e?.error?.stack || `${e?.filename}:${e?.lineno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason
    logError('unhandledrejection', r?.message || String(r), r?.stack)
  })
}
