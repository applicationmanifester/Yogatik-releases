const CACHE_NAME = 'bgk-ai-v1';
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
  const url = new URL(e.request.url);
  // Skip non-http(s) schemes (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;
  // Never cache API calls or SSE streams
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/chat') ||
      e.request.headers.get('accept')?.includes('text/event-stream')) {
    return;
  }
  // Network-first for HTML, cache-first for assets
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        if (resp.ok && url.protocol.startsWith('http')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => new Response('', { status: 408 })))
    );
  }
});
