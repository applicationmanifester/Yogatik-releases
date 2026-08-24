import React from 'react'

/**
 * Enhanced React.lazy wrapper with automatic chunk load recovery.
 * If a new version was deployed and an old lazy-loaded chunk returns 404,
 * this clears the stale version cache and reloads the current page automatically.
 */
export function safeLazy(factory) {
  return React.lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      const isChunkError =
        err?.message?.includes('Failed to fetch dynamically imported module') ||
        err?.message?.includes('Importing a module script failed') ||
        err?.message?.includes('error loading dynamically imported module') ||
        err?.message?.includes('Loading chunk') ||
        err?.name === 'TypeError'

      const reloadKey = 'yogatik_chunk_reload_' + (typeof window !== 'undefined' ? window.location.pathname : '')
      const lastReload = typeof sessionStorage !== 'undefined' ? parseInt(sessionStorage.getItem(reloadKey) || '0', 10) : 0
      const now = Date.now()

      // Allow automatic recovery if not reloaded in the last 15 seconds
      if (isChunkError && (now - lastReload > 15000) && typeof window !== 'undefined') {
        sessionStorage.setItem(reloadKey, String(now))
        if ('caches' in window) {
          try {
            const keys = await caches.keys()
            await Promise.all(keys.filter(k => k.startsWith('yogatik-')).map(k => caches.delete(k)))
          } catch {}
        }
        window.location.reload()
        return new Promise(() => {}) // Halt resolution during reload
      }
      throw err
    }
  })
}
