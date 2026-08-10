import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => {
  const store = new Map()
  return {
    getSetting: vi.fn(async (k, d) => (store.has(k) ? store.get(k) : d ?? null)),
    setSetting: vi.fn(async (k, v) => { store.set(k, v) }),
    __store: store,
  }
})
vi.mock('./llm', () => ({
  getProviders: () => ({ nvidia: { name: 'NVIDIA', models: [], baseUrl: 'x' } }),
  registerCustomProviders: vi.fn(),
  fetchLiveModels: vi.fn(async () => []),
  chatComplete: vi.fn(),
  proxyAvailable: () => true,
}))
vi.mock('./agent', () => ({ runAgent: vi.fn() }))
vi.mock('./tools/index', () => ({ getToolNames: () => [] }))
vi.mock('./tools/documents', () => ({ invalidateDocIndex: vi.fn() }))
vi.mock('./retrieval', () => ({ chunkText: () => [] }))
vi.mock('./firebaseAuth', () => ({
  signInWithGoogle: vi.fn(), logOutGoogle: vi.fn(),
  saveUserApiKey: vi.fn(), getUserApiKeys: vi.fn(), purgePlaintextKeys: vi.fn(),
}))

const db = await import('./db')
const { classifyQuery, routeModel } = await import('./api')

const MODELS = [
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.3-70b-instruct',
  'deepseek-ai/deepseek-coder-6.7b-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
]

beforeEach(async () => {
  db.__store.clear()
  const { routeCache } = await import('./api')
  routeCache.clear()
})

describe('classifyQuery', () => {
  it.each([
    ['fix this bug in my python function', 'code'],
    ['```js\nconst x = 1\n``` what is wrong?', 'code'],
    ['derive the quadratic formula step by step', 'reasoning'],
    ['write a poem about rain', 'writing'],
    ['what time is it in Tokyo', 'quick'],
  ])('classifies %s', (text, expected) => {
    expect(classifyQuery(text)).toBe(expected)
  })

  it('treats very long prompts as reasoning', () => {
    expect(classifyQuery('a'.repeat(500))).toBe('reasoning')
  })
})

describe('routeModel', () => {
  const measure = async (model, latencyMs, success = true) => {
    await db.setSetting(`status_nvidia::${model}`, { success, model, latencyMs, at: Date.now() })
  }

  it('returns null when nothing has been measured', async () => {
    await db.setSetting('models_nvidia', { ts: Date.now(), list: MODELS })
    expect(await routeModel('nvidia', 'hello')).toBeNull()
  })

  it('sends code questions to a code model', async () => {
    await db.setSetting('models_nvidia', { ts: Date.now(), list: MODELS })
    await measure('meta/llama-3.1-8b-instruct', 300)
    await measure('deepseek-ai/deepseek-coder-6.7b-instruct', 900)

    const r = await routeModel('nvidia', 'refactor this function please')
    expect(r.kind).toBe('code')
    // chosen despite being slower — category beats raw speed
    expect(r.model).toBe('deepseek-ai/deepseek-coder-6.7b-instruct')
  })

  it('sends quick questions to the fastest small model', async () => {
    await db.setSetting('models_nvidia', { ts: Date.now(), list: MODELS })
    await measure('meta/llama-3.1-8b-instruct', 250)
    await measure('meta/llama-3.3-70b-instruct', 4000)

    const r = await routeModel('nvidia', 'capital of France?')
    expect(r.model).toBe('meta/llama-3.1-8b-instruct')
  })

  it('never routes to a model that failed its probe', async () => {
    await db.setSetting('models_nvidia', { ts: Date.now(), list: MODELS })
    await measure('deepseek-ai/deepseek-coder-6.7b-instruct', 0, false)
    await measure('meta/llama-3.1-8b-instruct', 300)

    const r = await routeModel('nvidia', 'debug my code')
    expect(r.model).toBe('meta/llama-3.1-8b-instruct')
  })

  it('falls back to any working model when the category has none', async () => {
    await db.setSetting('models_nvidia', { ts: Date.now(), list: MODELS })
    await measure('meta/llama-3.3-70b-instruct', 2000)

    const r = await routeModel('nvidia', 'write me a haiku')
    expect(r.model).toBe('meta/llama-3.3-70b-instruct')
  })
})
