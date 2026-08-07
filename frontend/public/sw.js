const CACHE_NAME = 'yogatik-v3';
const STATIC_ASSETS = ['/', '/index.html', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only ever touch same-origin GETs. Everything else — LLM/proxy POSTs,
  // SSE streams, cross-origin API calls — goes straight to the network
  // untouched. Intercepting them buffered streams and threw on cache.put().
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.startsWith('/api')) return;
  if (req.headers.get('accept')?.includes('text/event-stream')) return;

  // HTML: network-first so deploys land immediately, cache as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put('/index.html', clone)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('/index.html').then(r => r || Response.error()))
    );
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
