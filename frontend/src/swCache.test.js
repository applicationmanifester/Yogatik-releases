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

function runSw(existingCacheNames) {
  const src = SW_SRC

  const deleted = []
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
    open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => undefined }),
    match: async () => undefined,
  }

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', src)(
    self, caches, async () => ({ ok: true, clone: () => ({}) }), { error: () => ({}) },
  )

  return { listeners, deleted }
}

async function activate(existing) {
  const { listeners, deleted } = runSw(existing)
  let waited
  await listeners.activate({ waitUntil: (p) => { waited = p } })
  await waited
  return deleted
}

describe('service worker cache eviction', () => {
  it('deletes its own superseded caches', async () => {
    const deleted = await activate(['yogatik-v3', 'yogatik-v4'])
    expect(deleted).toContain('yogatik-v3')
    expect(deleted).not.toContain('yogatik-v4')
  })

  it('never deletes WebLLM model weights', async () => {
    const deleted = await activate([
      'yogatik-v4', 'webllm/model', 'webllm/wasm', 'webllm/config',
    ])
    expect(deleted).not.toContain('webllm/model')
    expect(deleted).not.toContain('webllm/wasm')
    expect(deleted).not.toContain('webllm/config')
  })

  it('never deletes the Transformers.js cache', async () => {
    const deleted = await activate(['yogatik-v4', 'transformers-cache'])
    expect(deleted).not.toContain('transformers-cache')
  })

  it('leaves every third-party cache alone while still evicting its own', async () => {
    const deleted = await activate([
      'yogatik-v1', 'yogatik-v4', 'webllm/model', 'transformers-cache', 'some-other-app',
    ])
    expect(deleted).toEqual(['yogatik-v1'])
  })
})
