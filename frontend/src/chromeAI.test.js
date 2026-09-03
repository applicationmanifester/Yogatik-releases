import { describe, it, expect, afterEach } from 'vitest'
import { chromeAIPresent, getChromeAIAvailability, streamChromeAI } from './chromeAI'

/** Installs a fake `LanguageModel` (the current Prompt API shape) global. */
function installFakeLanguageModel({ availability = 'available', chunksFor } = {}) {
  const created = []
  class FakeSession {
    constructor() { this.destroyed = false; this.prompts = [] }
    async prompt(text) { this.prompts.push(text); return 'ok' }
    promptStreaming(text) {
      this.prompts.push(text)
      const chunks = chunksFor ? chunksFor(text) : ['Hi', ' there']
      return (async function* () { for (const c of chunks) yield c })()
    }
    destroy() { this.destroyed = true }
  }
  globalThis.LanguageModel = {
    availability: async () => availability,
    create: async () => {
      const s = new FakeSession()
      created.push(s)
      return s
    },
  }
  return { created }
}

/** Installs the earlier `self.ai.languageModel` shape — still probed as a
 * fallback since Chrome shipped both while the spec stabilised. */
function installLegacyAI({ capability = 'readily' } = {}) {
  globalThis.ai = {
    languageModel: {
      capabilities: async () => ({ available: capability }),
      create: async () => ({
        prompt: async () => 'ok',
        promptStreaming: () => (async function* () { yield 'legacy ok' })(),
        destroy() {},
      }),
    },
  }
}

describe('chromeAI', () => {
  afterEach(() => {
    delete globalThis.LanguageModel
    delete globalThis.ai
  })

  it('chromeAIPresent reflects whether either API shape exists', () => {
    expect(chromeAIPresent()).toBe(false)
    installFakeLanguageModel()
    expect(chromeAIPresent()).toBe(true)
  })

  it('reports "unsupported" with an actionable reason when neither API exists — never a blind false', async () => {
    const r = await getChromeAIAvailability()
    expect(r.available).toBe(false)
    expect(r.state).toBe('unsupported')
    expect(r.reason).toMatch(/Prompt API/)
  })

  it('reports "available" when the model is ready to use right now', async () => {
    installFakeLanguageModel({ availability: 'available' })
    expect(await getChromeAIAvailability()).toEqual({ available: true, state: 'available' })
  })

  it('reports "downloadable" (still usable) with an explanation, not a plain yes/no', async () => {
    installFakeLanguageModel({ availability: 'downloadable' })
    const r = await getChromeAIAvailability()
    expect(r.available).toBe(true)
    expect(r.state).toBe('downloadable')
    expect(r.reason).toMatch(/downloads once/)
  })

  it('reports "unavailable" honestly rather than assuming readiness', async () => {
    installFakeLanguageModel({ availability: 'unavailable' })
    const r = await getChromeAIAvailability()
    expect(r.available).toBe(false)
    expect(r.state).toBe('unavailable')
  })

  it('falls back to the legacy self.ai.languageModel shape when that is all a browser exposes', async () => {
    installLegacyAI({ capability: 'readily' })
    expect(await getChromeAIAvailability()).toEqual({ available: true, state: 'available' })
  })

  it('streamChromeAI errors clearly instead of hanging when no Prompt API exists', async () => {
    let error = null
    let doneCalled = false
    await streamChromeAI({
      messages: [{ role: 'user', content: 'hi' }],
      onError: (e) => { error = e },
      onDone: () => { doneCalled = true },
    })
    expect(error).toBeTruthy()
    expect(doneCalled).toBe(false)
  })

  it('streams token deltas for a simple single-turn conversation', async () => {
    installFakeLanguageModel({ chunksFor: () => ['Hi', ' there'] })
    const tokens = []
    let done = false
    await streamChromeAI({
      messages: [{ role: 'system', content: 'Be nice.' }, { role: 'user', content: 'hello' }],
      onToken: (t) => tokens.push(t),
      onDone: () => { done = true },
      onError: (e) => { throw e },
    })
    expect(tokens.join('')).toBe('Hi there')
    expect(done).toBe(true)
  })

  it('normalises a full-text-each-tick stream into deltas so a token is never printed twice', async () => {
    // Some implementations yield the WHOLE text so far on every tick rather
    // than an incremental delta — this is the exact bug class the SSE
    // reasoning-tag handling in llm.js exists to avoid for hosted providers.
    installFakeLanguageModel({ chunksFor: () => ['Hi', 'Hi there'] })
    const tokens = []
    await streamChromeAI({
      messages: [{ role: 'user', content: 'hello' }],
      onToken: (t) => tokens.push(t),
      onDone: () => {},
      onError: (e) => { throw e },
    })
    expect(tokens.join('')).toBe('Hi there')
  })

  it('replays every prior turn as a plain prompt before streaming only the final turn', async () => {
    const { created } = installFakeLanguageModel()
    await streamChromeAI({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply one' },
        { role: 'user', content: 'second' },
      ],
      onToken: () => {},
      onDone: () => {},
      onError: (e) => { throw e },
    })
    const session = created[0]
    expect(session.prompts[0]).toBe('first')
    expect(session.prompts[1]).toBe('[assistant]: reply one')
    expect(session.prompts[2]).toBe('second') // the final turn, via promptStreaming
  })

  it('refuses a conversation that does not end on a user turn, rather than guessing', async () => {
    installFakeLanguageModel()
    let error = null
    await streamChromeAI({
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }],
      onError: (e) => { error = e },
      onDone: () => {},
    })
    expect(error).toBeTruthy()
    expect(String(error.message)).toMatch(/user turn/)
  })

  it('destroys the session on abort and still calls onDone, never onError', async () => {
    const { created } = installFakeLanguageModel({ chunksFor: () => ['a', 'b', 'c'] })
    const controller = new AbortController()
    let done = false
    let errored = false
    await streamChromeAI({
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
      onToken: () => { controller.abort() },
      onDone: () => { done = true },
      onError: () => { errored = true },
    })
    expect(done).toBe(true)
    expect(errored).toBe(false)
    expect(created[0].destroyed).toBe(true)
  })
})
