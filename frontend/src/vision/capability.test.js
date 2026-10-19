import { describe, it, expect, vi } from 'vitest'

// The heuristic is pure; its module's storage/network edges are not needed here.
vi.mock('../db', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }))
vi.mock('../llm', () => ({ chatComplete: vi.fn() }))

const { looksVisionCapable, findVisionCandidate } = await import('./capability')
const { getSetting, setSetting } = await import('../db')
const { chatComplete } = await import('../llm')

describe('vision name heuristic', () => {
  it('recognises the families that actually take images', () => {
    for (const m of [
      'gpt-4o', 'gpt-4.1-mini', 'gemini-2.5-flash',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen2.5-vl-72b-instruct', 'mistralai/pixtral-12b',
      'llava-hf/llava-1.5-7b', 'microsoft/phi-3.5-vision-instruct',
      'nvidia/nemotron-nano-vl-8b',
    ]) expect(looksVisionCapable(m), m).toBe(true)
  })

  it('rejects text-only and non-chat models', () => {
    for (const m of [
      'llama-3.3-70b-instruct', 'mixtral-8x7b', 'deepseek-r1',
      'text-embedding-3-large', 'baai/bge-m3', 'whisper-large-v3',
      'llama-guard-4-12b', 'qwen2.5-coder-32b',
    ]) expect(looksVisionCapable(m), m).toBe(false)
  })

  it('lets the exclusion list win over a matching keyword', () => {
    // "guard" and "embed" beat "vision"/"vl" — these never accept chat images.
    expect(looksVisionCapable('llama-guard-vision-11b')).toBe(false)
    expect(looksVisionCapable('nomic-embed-vision-v1.5')).toBe(false)
  })

  it('handles empty input', () => {
    expect(looksVisionCapable('')).toBe(false)
    expect(looksVisionCapable(undefined)).toBe(false)
  })
})

// ── findVisionCandidate — the camera guard's auto-resolution (Horizon 1) ──
// The decision policy itself lives in live/guard.js (tested there, pure);
// these pin the RESOLUTION contract behind it: cache-first, name-gated
// probes, never re-asking the active model.
describe('findVisionCandidate (same-provider auto-switch resolver)', () => {
  it('returns a cached vision model with NO network at all', async () => {
    getSetting.mockReset()
    chatComplete.mockReset()
    // First candidate cached blind, later one cached able — the cache pass
    // walks the list in order and answers without a single chat call.
    getSetting.mockImplementation(key => {
      if (key === 'vision_p::m-blind') return { ok: false, at: Date.now(), }
      if (key === 'vision_p::m-vision') return { ok: true, at: Date.now(), }
      return undefined
    })
    await expect(findVisionCandidate({ provider: 'p', apiKey: 'k', models: ['m-blind', 'm-vision'] }))
      .resolves.toBe('m-vision')
    expect(chatComplete).not.toHaveBeenCalled()
  })

  it('never re-probes the active (known text-only) model', async () => {
    getSetting.mockReset()
    chatComplete.mockReset()
    getSetting.mockReturnValue(undefined)
    chatComplete.mockResolvedValue('ok')
    // Its name says vision (scout) — but the current model is known-blind, so
    // it must not even be probed, let alone picked.
    await expect(findVisionCandidate({ provider: 'p', models: ['llama-4-scout'], skip: 'llama-4-scout' }))
      .resolves.toBeNull()
    expect(chatComplete).not.toHaveBeenCalled()
  })

  it('probes only the name-guessing candidates and returns the first confirmed', async () => {
    getSetting.mockReset()
    chatComplete.mockReset()
    getSetting.mockReturnValue(undefined)
    chatComplete.mockResolvedValue('ok')
    await expect(findVisionCandidate({ provider: 'p', models: ['llama-3.3-70b-instruct', 'qwen2.5-vl-72b-instruct'] }))
      .resolves.toBe('qwen2.5-vl-72b-instruct')
    // The text-named model was never probed — probes cost a real round trip.
    expect(chatComplete).toHaveBeenCalledTimes(1)
    expect(chatComplete.mock.calls[0][0].model).toBe('qwen2.5-vl-72b-instruct')
  })

  it('returns null and caches the negative when probing fails with a 400', async () => {
    getSetting.mockReset()
    setSetting.mockReset()
    chatComplete.mockReset()
    getSetting.mockReturnValue(undefined)
    chatComplete.mockRejectedValue(new Error('400 bad request: unsupported image'))
    await expect(findVisionCandidate({ provider: 'p', models: ['gpt-4o-mini'] })).resolves.toBeNull()
    // The negative verdict is stored, so the next camera press consults the
    // cache instead of re-asking a model that will not take images.
    expect(setSetting).toHaveBeenCalledWith('vision_p::gpt-4o-mini', { ok: false, at: expect.any(Number) })
  })

  it('caps the probes instead of walking the whole provider list', async () => {
    getSetting.mockReset()
    chatComplete.mockReset()
    getSetting.mockReturnValue(undefined)
    chatComplete.mockRejectedValue(new Error('400 unsupported image'))
    await expect(findVisionCandidate({ provider: 'p', models: ['a-vl', 'b-vl', 'c-vl'], maxProbes: 2 }))
      .resolves.toBeNull()
    expect(chatComplete).toHaveBeenCalledTimes(2)
  })

  it('treats an expired cache verdict as unknown and re-probes', async () => {
    getSetting.mockReset()
    setSetting.mockReset()
    chatComplete.mockReset()
    // TTL is 7 days (capabilities change slowly) — an 8-day-old "ok" is stale.
    getSetting.mockImplementation(key => {
      if (key === 'vision_p::gpt-4o') return { ok: true, at: Date.now() - 8 * 24 * 60 * 60 * 1000 }
      return undefined
    })
    chatComplete.mockResolvedValue('ok')
    await expect(findVisionCandidate({ provider: 'p', models: ['gpt-4o'] })).resolves.toBe('gpt-4o')
    expect(chatComplete).toHaveBeenCalledTimes(1)
  })

  it('answers null when nothing is cached and no name suggests vision', async () => {
    getSetting.mockReset()
    chatComplete.mockReset()
    chatComplete.mockRejectedValue(new Error('400'))
    await expect(findVisionCandidate({ provider: 'p', models: ['llama-3.3-70b-instruct', 'deepseek-r1'] }))
      .resolves.toBeNull()
    expect(chatComplete).not.toHaveBeenCalled()
  })
})
