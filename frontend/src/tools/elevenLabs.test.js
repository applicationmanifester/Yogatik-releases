import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let settingsStore = {}
vi.mock('../db', () => ({
  getSetting: vi.fn(async (k, fallback = '') => (settingsStore[k] ?? fallback)),
  setSetting: vi.fn(async (k, v) => { settingsStore[k] = v; return true }),
}))

import {
  testElevenLabsKey,
  fetchElevenLabsVoices,
  synthesizeElevenLabs,
  saveElevenLabsApiKey,
  getElevenLabsApiKey,
  DEFAULT_ELEVENLABS_VOICES,
} from './elevenLabs'

describe('ElevenLabs Voice Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    settingsStore = {}
  })

  it('saves and retrieves API key properly', async () => {
    await saveElevenLabsApiKey('test-key-123')
    const key = await getElevenLabsApiKey()
    expect(key).toBe('test-key-123')
  })

  it('tests API key validity via /v1/user endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        subscription: {
          tier: 'starter',
          character_count: 1200,
          character_limit: 30000,
        },
      }),
    })

    const res = await testElevenLabsKey('valid-key')
    expect(res.success).toBe(true)
    expect(res.tier).toBe('starter')
    expect(res.characterCount).toBe(1200)
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': 'valid-key' },
    })
  })

  it('throws error when testElevenLabsKey receives 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    })

    await expect(testElevenLabsKey('bad-key')).rejects.toThrow('ElevenLabs authentication failed (401)')
  })

  it('fetches voices from /v1/voices with fallback to defaults', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { voice_id: 'custom-1', name: 'Studio Voice', category: 'cloned' },
        ],
      }),
    })

    const voices = await fetchElevenLabsVoices('valid-key')
    expect(voices).toHaveLength(1)
    expect(voices[0].voice_id).toBe('custom-1')
    expect(voices[0].name).toContain('Custom Clone')
  })

  it('synthesizes audio via ElevenLabs POST endpoint', async () => {
    const mockBlob = new Blob(['mock-audio'], { type: 'audio/mpeg' })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    })

    const res = await synthesizeElevenLabs({
      text: 'Hello world from ElevenLabs',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      apiKey: 'valid-key',
    })

    expect(res.mime).toBe('audio/mpeg')
    expect(res.blob).toBe(mockBlob)
    expect(res.audioUrl).toBeDefined()
  })
})
