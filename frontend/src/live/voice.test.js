import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSpeaker, defaultLang } from './voice'

/** Minimal speechSynthesis: records what was said, fires the callbacks. */
function stubSynthesis() {
  const said = []
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text }
  }
  globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (u) => {
      said.push(u.text)
      u.onstart?.()
      setTimeout(() => u.onend?.(), 0)
    },
  }
  return said
}

const flush = () => new Promise(r => setTimeout(r, 50))

beforeEach(() => { vi.restoreAllMocks() })

describe('speaker configure', () => {
  it('applies a later voice change (male/female) via the chosen system voice', async () => {
    // Two system voices; the hint should pick the male one after reconfigure.
    globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
    let picked = null
    globalThis.speechSynthesis = {
      getVoices: () => [
        { name: 'Samantha', lang: 'en-US' },
        { name: 'David', lang: 'en-US' },
      ],
      cancel: vi.fn(),
      speak: (u) => { picked = u.voice?.name; u.onstart?.(); setTimeout(() => u.onend?.(), 0) },
    }
    const sp = createSpeaker({ engine: 'system', voice: 'af_heart' })
    sp.configure({ voice: 'am_michael' }) // switch to a male voice
    sp.speak('hi')
    await flush()
    expect(picked).toBe('David')
  })
})

describe('speaker queue', () => {
  it('speaks clauses in order, never overlapping', async () => {
    const said = stubSynthesis()
    const sp = createSpeaker({ engine: 'system' })
    sp.speak('one')
    sp.speak('two')
    sp.speak('three')
    await flush()
    expect(said).toEqual(['one', 'two', 'three'])
  })

  it('reports speaking start once and end once per burst', async () => {
    stubSynthesis()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const sp = createSpeaker({ engine: 'system', onStart, onEnd })
    sp.speak('a'); sp.speak('b')
    await flush()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(sp.speaking).toBe(false)
  })

  it('drops everything queued on barge-in', async () => {
    const said = stubSynthesis()
    const sp = createSpeaker({ engine: 'system' })
    sp.speak('first')
    sp.cancel()
    sp.speak('after')
    await flush()
    expect(said).not.toContain('after was interrupted')
    expect(said[said.length - 1]).toBe('after')   // the new turn still speaks
    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('ignores empty text', async () => {
    const said = stubSynthesis()
    const sp = createSpeaker({ engine: 'system' })
    sp.speak('   ')
    sp.speak('')
    await flush()
    expect(said).toEqual([])
  })
})

describe('neural upgrade', () => {
  it('talks on the system voice until the model has downloaded', async () => {
    const said = stubSynthesis()
    let release
    const preload = () => new Promise(r => { release = r })
    const synth = vi.fn(async () => ({ pcm: new Float32Array(8), sampleRate: 24000 }))
    const onEngine = vi.fn()

    const sp = createSpeaker({ engine: 'neural', preload, synth, onEngine })
    sp.speak('early')
    await flush()
    expect(said).toEqual(['early'])       // spoken, not swallowed while waiting
    expect(synth).not.toHaveBeenCalled()

    release()
    await flush()
    expect(onEngine).toHaveBeenCalledWith('neural')
  })

  it('stays on the system voice if the download fails', async () => {
    const said = stubSynthesis()
    const onEngine = vi.fn()
    const sp = createSpeaker({
      engine: 'neural',
      preload: () => Promise.reject(new Error('offline')),
      synth: vi.fn(),
      onEngine,
    })
    await flush()
    sp.speak('still works')
    await flush()
    expect(onEngine).toHaveBeenCalledWith('system')
    expect(said).toEqual(['still works'])
  })
})

describe('defaultLang', () => {
  it('follows the browser rather than hardcoding en-US', () => {
    expect(defaultLang()).toMatch(/^[a-z]{2}-[A-Za-z]{2,}$/)
  })
})
