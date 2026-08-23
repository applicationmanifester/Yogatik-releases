import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { translateTool } from './translate'

// These used to call the live MyMemory API: they failed offline, in CI, and
// whenever the shared daily quota ran out — a flake that says nothing about our
// code. What we actually own is the language normalisation and the result shape,
// so the endpoint is stubbed and the assertions stay the same.
const CANNED = { es: 'Hola', fr: 'Bonjour', de: 'Hallo', hi: 'नमस्ते', te: 'హలో', ja: 'こんにちは' }

describe('translateTool', () => {
  let seen
  beforeEach(() => {
    seen = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      seen.push(url)
      const pair = decodeURIComponent(String(url).split('langpair=')[1] || '')
      const target = pair.split('|')[1]
      return {
        ok: true,
        json: async () => ({
          responseStatus: 200,
          responseData: { translatedText: CANNED[target] || `[${target}]`, match: 1 },
        }),
      }
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('normalizes language names to 2-letter ISO codes', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Spanish', source: 'English' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('es')
    expect(res.source).toBe('en')
    expect(res.translated.toLowerCase()).toContain('hola')
    expect(seen[0]).toContain('langpair=en|es')
  })

  it('translates text to French', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'French' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('fr')
    expect(res.translated.toLowerCase()).toContain('bonjour')
  })

  it('translates text to German', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'de' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('de')
    expect(res.translated.toLowerCase()).toContain('hallo')
  })

  it('translates text to Hindi', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Hindi' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('hi')
    expect(res.translated).toBeTruthy()
  })

  it('translates text to Telugu', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Telugu' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('te')
    expect(res.translated).toBeTruthy()
  })

  it('translates text to Japanese', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'ja' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('ja')
    expect(res.translated).toBeTruthy()
  })

  it('rejects empty text', async () => {
    const res = await translateTool.execute({ text: '', target: 'es' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Nothing to translate')
  })

  it('surfaces a quota refusal as an error, not an empty translation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ responseStatus: 200, quotaFinished: true, responseData: { translatedText: '' } }),
    })))
    const res = await translateTool.execute({ text: 'Hello', target: 'es' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/quota/i)
  })
})
