/**
 * The service worker's activate handler evicts stale caches. It must evict ONLY
 * the caches this app owns.
 *
 * WebLLM keeps its weights in `webllm/model`, `webllm/wasm` and `webllm/config`
 * (verified against @mlc-ai/web-llm 0.2.84), and Transformers.js keeps MiniLM /
 * SmolVLM / Whisper / Kokoro in `transformers-cache`. Those are up to ~1.7GB the
 * user explicitly consented to download. A blanket "delete every cache whose
 * name !== CACHE_NAME" throws all of it away on every single deploy.
 *
 * Worse than the re-download: WebLLM memoises its Cache handle
 * (`this.cache === void 0 && (this.cache = await caches.open(this.scope))`) and
 * then calls `cache.add(req)`. Deleting that cache mid-download leaves it
 * writing into a handle whose store is gone, which surfaces as the opaque
 * "Failed to execute 'add' on 'Cache': Request failed".
 *
 * This runs the REAL public/sw.js in a fake worker scope — the eviction rule is
 * only meaningful as shipped.
 */
import { describe, it, expect } from 'vitest'
// Vite's ?raw inlines the file as a string at transform time. Neither node:fs
// nor process.cwd() works here: this file lints under the browser env (no
// `process`), and under vitest import.meta.url is an http:// URL that
// readFileSync rejects with "The URL must be of scheme file".
import SW_SRC from '../public/sw.js?raw'

function runSw(existingCacheNames, fetchImpl) {
  const src = SW_SRC

  const deleted = []
  const put = []
  const listeners = {}
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    registration: { navigationPreload: { enable: async () => {} } },
    clients: { claim: async () => {} },
    location: { origin: 'https://yogatik.web.app' },
    skipWaiting: () => {},
  }
  const caches = {
    keys: async () => existingCacheNames.slice(),
    delete: async (k) => { deleted.push(k); return true },
    open: async () => ({
      addAll: async () => {},
      put: async (key) => { put.push(typeof key === 'string' ? key : key?.url) },
      match: async () => undefined,
    }),
    match: async () => undefined,
  }

  // Must be a real constructor: the script/HTML guard below does
  // `new Response(body, init)`, not just `Response.error()`.
  function FakeResponse(body, init) {
    this.body = body
    this.status = init?.status
    this.statusText = init?.statusText
    this.ok = (init?.status ?? 200) < 400
  }
  FakeResponse.error = () => ({})

  new Function('self', 'caches', 'fetch', 'Response', src)(
    self, caches,
    fetchImpl || (async () => ({ ok: true, clone: () => ({}) })),
    FakeResponse,
  )

  return { listeners, deleted, put }
}

async function activate(existing) {
  const { listeners, deleted } = runSw(existing)
  let waited
  await listeners.activate({ waitUntil: (p) => { waited = p } })
  await waited
  return deleted
}

const currentCacheMatch = SW_SRC.match(/const CACHE_NAME = ['"]([^'"]+)['"]/)
const currentCache = currentCacheMatch ? currentCacheMatch[1] : 'yogatik-v5'

describe('service worker cache eviction', () => {
  it('deletes its own superseded caches', async () => {
    const deleted = await activate(['yogatik-v1', currentCache])
    expect(deleted).toContain('yogatik-v1')
    expect(deleted).not.toContain(currentCache)
  })

  it('never deletes WebLLM model weights', async () => {
    const deleted = await activate([
      currentCache, 'webllm/model', 'webllm/wasm', 'webllm/config',
    ])
    expect(deleted).not.toContain('webllm/model')
    expect(deleted).not.toContain('webllm/wasm')
    expect(deleted).not.toContain('webllm/config')
  })

  it('never deletes the Transformers.js cache', async () => {
    const deleted = await activate([currentCache, 'transformers-cache'])
    expect(deleted).not.toContain('transformers-cache')
  })

  it('does not cache a failed navigation as the app shell', async () => {
    // Caching a 503 under /index.html poisons the offline fallback: every later
    // offline navigation serves the error page instead of the app.
    const { listeners, put } = runSw([currentCache], async () => ({ ok: false, status: 503, clone: () => ({}) }))
    let responded
    await listeners.fetch({
      request: { method: 'GET', url: 'https://yogatik.web.app/', mode: 'navigate', headers: { get: () => null } },
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p) => { responded = p },
    })
    await responded
    expect(put).toEqual([])
  })

  it('caches a good navigation as the app shell', async () => {
    const { listeners, put } = runSw([currentCache], async () => ({ ok: true, status: 200, clone: () => ({}) }))
    let responded
    await listeners.fetch({
      request: { method: 'GET', url: 'https://yogatik.web.app/', mode: 'navigate', headers: { get: () => null } },
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p) => { responded = p },
    })
    await responded
    expect(put).toEqual(['/index.html'])
  })

  it('refuses to cache HTML served for a missing script chunk', async () => {
    // Firebase Hosting's SPA rewrite serves index.html (200, text/html) for any
    // path it doesn't recognise — including a hashed chunk a deploy removed.
    // Caching that under the chunk's own cache key would make every later
    // dynamic import() of it "succeed" with an HTML document instead of JS.
    const { listeners, put } = runSw([currentCache], async () => ({
      ok: true, status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
      clone: () => ({}),
    }))
    let responded
    await listeners.fetch({
      request: { method: 'GET', url: 'https://yogatik.web.app/assets/index-abc123.js', mode: 'no-cors', headers: { get: () => null } },
      respondWith: (p) => { responded = p },
    })
    const resp = await responded
    expect(resp.status).toBe(404)
    expect(put).toEqual([])
  })

  it('still caches a real script response normally', async () => {
    const { listeners, put } = runSw([currentCache], async () => ({
      ok: true, status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/javascript' : null) },
      clone: () => ({}),
    }))
    let responded
    await listeners.fetch({
      request: { method: 'GET', url: 'https://yogatik.web.app/assets/index-abc123.js', mode: 'no-cors', headers: { get: () => null } },
      respondWith: (p) => { responded = p },
    })
    await responded
    expect(put).toEqual(['https://yogatik.web.app/assets/index-abc123.js'])
  })

  it('leaves every third-party cache alone while still evicting its own', async () => {
    const deleted = await activate([
      'yogatik-v1', currentCache, 'webllm/model', 'transformers-cache', 'some-other-app',
    ])
    expect(deleted).toEqual(['yogatik-v1'])
  })
})
