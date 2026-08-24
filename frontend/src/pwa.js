/**
 * Service worker lifecycle + lazy-chunk safety.
 *
 * Two failures this file exists to prevent:
 *
 * 1. sw.js used to call skipWaiting() during install, so a deploy took over the
 *    page mid-session. The running page still holds the OLD hashed chunk names,
 *    and those files are gone — every later lazy import (Prism, Firebase, pdf.js,
 *    WebLLM) dies with "Failed to fetch dynamically imported module". The new
 *    worker now waits, and the user is told there is an update.
 *
 * 2. Even so, a tab left open across a deploy can request a chunk that no longer
 *    exists. retryImport() gives it one more go — enough for a transient network
 *    blip — and otherwise reloads once, which fetches the new index and the new
 *    chunk names. The reload is guarded by a sessionStorage flag so a genuinely
 *    broken build cannot put the page in a reload loop.
 */

const RELOADED = 'yogatik.chunkReload'

/**
 * Wrap a dynamic import so a stale or flaky chunk cannot dead-end the UI.
 * @param {() => Promise<any>} load
 */
export function retryImport(load) {
  return async () => {
    try {
      return await load()
    } catch (err) {
      try { return await load() } catch { /* fall through to reload */ }
      let reloadedAlready = false
      try {
        reloadedAlready = sessionStorage.getItem(RELOADED) === '1'
        sessionStorage.setItem(RELOADED, '1')
      } catch { /* private mode: skip the guard, not the throw */ }
      if (!reloadedAlready) {
        location.reload()
        // Never settles; the page is going away. Rejecting here would flash an
        // error boundary over a page that is already reloading.
        return new Promise(() => {})
      }
      throw err
    }
  }
}

/** Clear the loop guard once the app has rendered successfully. */
export function markAppHealthy() {
  try { sessionStorage.removeItem(RELOADED) } catch { /* ignore */ }
}

/**
 * Register the worker and report when a new version is waiting.
 * @param {(apply: () => void) => void} onUpdateReady
 */
export function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return

  // In development (Vite dev server) the SW must be completely inactive:
  // 1. Unregister any old workers so they stop intercepting /src/* requests
  // 2. Do NOT add the controllerchange listener — unregistering the old SW
  //    changes the controller to null, which would trigger location.reload()
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => { for (const r of regs) r.unregister() })
      .catch(() => {})
    return
  }

  // ── Production only ────────────────────────────────────────────────────────

  // Whether this page was ALREADY controlled when it loaded, captured before
  // anything can change it. This is the difference between "a new version took
  // over, refresh so the hashed chunks match" and "the very first worker just
  // claimed a page that is already running the newest code".
  const hadControllerAtLoad = !!navigator.serviceWorker.controller

  navigator.serviceWorker.register('/sw.js').then(reg => {
    const offer = (worker) => {
      if (!worker) return
      onUpdateReady?.(() => {
        worker.postMessage({ type: 'SKIP_WAITING' })
      })
    }

    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting)

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      installing?.addEventListener('statechange', () => {
        // No controller means this is the first install, not an update.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          offer(reg.waiting || installing)
        }
      })
    })

    // A deploy landed while the tab was in the background.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {})
    })
  }).catch(() => { /* http, private mode, or unsupported: no worker, app still works */ })

  // Reload when a NEW SW takes control so hashed chunk names are refreshed.
  //
  // MEASURED 2026-08-24 in headless Chromium: sw.js calls clients.claim() on
  // activate, so on a first visit the freshly installed worker claims a page
  // that was loaded without one. controllerchange fired, the controller was
  // non-null, and the guard below let it through — so every first-time visitor
  // downloaded the ENTIRE app twice: 2.3MB, then a full reload and 2.3MB again,
  // index.html and all 20 chunks. The page was already running the exact code
  // that worker caches; there was nothing to refresh.
  //
  // The check has to be "was this page controlled when it loaded", not "is
  // there a controller now" — by the time the event fires there always is one.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (import.meta.env.DEV || !navigator.serviceWorker.controller) return
    if (!hadControllerAtLoad) return
    if (reloading) return
    reloading = true
    location.reload()
  })
}

