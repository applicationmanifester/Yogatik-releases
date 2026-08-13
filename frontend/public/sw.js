const CACHE_NAME = 'yogatik-v3';
const STATIC_ASSETS = ['/', '/index.html', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (e) => {
  // NO skipWaiting here. Taking over immediately swaps the worker under a page
  // that still references the previous build's hashed chunks, and every later
  // lazy import 404s. The page asks for the swap when the user accepts it.
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Navigation preload: start the network fetch in parallel with SW startup,
    // shaving the worker's boot latency off first navigations.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* unsupported */ }
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only ever touch same-origin GETs. Everything else — LLM/proxy POSTs,
  // SSE streams, cross-origin API calls — goes straight to the network
  // untouched. Intercepting them buffered streams and threw on cache.put().
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/@') || url.search.includes('token=')) return;
  if (req.headers.get('accept')?.includes('text/event-stream')) return;

  // HTML: network-first so deploys land immediately, cache as offline fallback.
  // Uses the navigation-preload response when the browser provided one.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resp = (await e.preloadResponse) || await fetch(req);
        caches.open(CACHE_NAME).then(c => c.put('/index.html', resp.clone())).catch(() => {});
        return resp;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Hashed assets are immutable: serve from cache, refresh in background.
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
          }
          return resp;
        })
        // Propagate the real network failure instead of inventing a 408,
        // so callers see an actual error they can act on.
        .catch(err => { if (cached) return cached; throw err; });
      return cached || network;
    })
  );
});
