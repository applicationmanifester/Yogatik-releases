import { describe, it, expect, vi, beforeEach } from 'vitest'

let settingsStore = {}
vi.mock('../db', () => ({
  getSetting: vi.fn(async (k, fallback = '') => (settingsStore[k] ?? fallback)),
  setSetting: vi.fn(async (k, v) => { settingsStore[k] = v; return true }),
  saveMedia: vi.fn(async () => 101),
}))

vi.mock('./elevenLabs', () => ({
  getElevenLabsApiKey: vi.fn(async () => settingsStore['apikey_elevenlabs'] || ''),
  synthesizeElevenLabs: vi.fn(async ({ text, voiceId }) => ({
    blob: new Blob([`audio-data-${voiceId}-${text}`], { type: 'audio/mpeg' }),
    audioUrl: 'blob:mock-eleven-audio',
    mime: 'audio/mpeg',
  })),
  DEFAULT_ELEVENLABS_VOICE: '21m00Tcm4TlvDq8ikWAM',
}))

vi.mock('../video/speech', () => ({
  cleanForSpeech: (t) => t?.trim() || '',
  synthesize: vi.fn(async (text, { voice }) => ({
    pcm: new Float32Array(2400),
    sampleRate: 24000,
  })),
  VOICES: { af_heart: 'Heart', am_adam: 'Adam' },
  DEFAULT_VOICE: 'af_heart',
  SAMPLE_RATE: 24000,
}))

import { podcastGenerateTool } from './podcastGen'

describe('Podcast / Multi-Speaker Generator Tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    settingsStore = {}
  })

  it('rejects empty dialogue turns', async () => {
    const res = await podcastGenerateTool.execute({ title: 'Tech Talk', dialogue: [] })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Dialogue must be an array')
  })

  it('synthesizes multi-speaker podcast using ElevenLabs when key is configured', async () => {
    settingsStore['apikey_elevenlabs'] = 'xi-api-key-test'

    const res = await podcastGenerateTool.execute({
      title: 'AI Revolution',
      dialogue: [
        { speaker: 'Host', text: 'Welcome everyone to our tech deep dive.' },
        { speaker: 'Guest', text: 'Thanks for having me! Quantum and AI are merging fast.' },
      ],
      engine: 'elevenlabs',
    })

    expect(res.success).toBe(true)
    expect(res.tool).toBe('podcast_generate')
    expect(res.engine).toBe('elevenlabs')
    expect(res.turns).toBe(2)
    expect(res.media_id).toBe(101)
  })

  it('synthesizes podcast on-device with Kokoro when offline / no ElevenLabs key', async () => {
    settingsStore['apikey_elevenlabs'] = ''

    const res = await podcastGenerateTool.execute({
      title: 'Local Privacy',
      dialogue: [
        { speaker: 'Host', text: 'Welcome to the local privacy show.' },
        { speaker: 'Guest', text: 'Everything is running on your CPU and GPU.' },
      ],
      engine: 'kokoro',
    })

    expect(res.success).toBe(true)
    expect(res.engine).toBe('kokoro')
    expect(res.duration_sec).toBeGreaterThan(0)
    expect(res.mime).toBe('audio/wav')
  })
})
