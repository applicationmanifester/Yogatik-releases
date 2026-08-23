/**
 * text_to_audio — turn text into a downloadable narrated audio file (WAV or MP3),
 * spoken by either the on-device Kokoro voice (Apache-2.0, 100% private, free)
 * or the ElevenLabs cloud voice API (studio-grade quality, custom clones).
 *
 * Unlike the `tts` tool (which plays through the speakers and returns nothing to
 * hold), this produces a real file the user can save, share, or replay — a
 * single-voice "audio overview" of any text.
 */

import { synthesize, cleanForSpeech, VOICES, DEFAULT_VOICE, SAMPLE_RATE } from '../video/speech'
import { synthesizeElevenLabs, getElevenLabsApiKey, DEFAULT_ELEVENLABS_VOICE } from './elevenLabs'
import { saveMedia, getSetting } from '../db'

const MAX_CHARS = 8000

/** Split into speakable chunks (~350 chars) at sentence boundaries. */
function chunk(text, size = 350) {
  const sentences = String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [text]
  const out = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > size && cur) { out.push(cur.trim()); cur = '' }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Float32 PCM → 16-bit mono WAV Blob. Pure, no encoder dependency. */
function encodeWav(pcm, sampleRate) {
  const n = pcm.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    o += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export const textToAudioTool = {
  schema: {
    description:
      'Narrate text into a downloadable audio file (WAV/MP3) using on-device neural voice (Kokoro) or ElevenLabs studio cloud voices. ' +
      'Use when the user wants to LISTEN to something as a file: an audio summary, a read-aloud of an article, ' +
      'a spoken note, or a single-voice "audio overview". For a quick speak-aloud with no file, use tts instead.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to narrate. Plain prose reads best.' },
        voice: { type: 'string', description: 'Voice ID or preset name (e.g. af_heart, af_nova, bf_emma, or an ElevenLabs voice ID).' },
        engine: { type: 'string', enum: ['kokoro', 'elevenlabs'], description: 'TTS engine: kokoro (on-device, default) or elevenlabs (cloud API).' },
        speed: { type: 'number', description: 'Speaking speed 0.6-1.5 (default 1)' },
      },
      required: ['text'],
    },
  },
  async execute({ text, voice, engine, speed = 1 }) {
    const clean = cleanForSpeech(text)
    if (!clean) return { success: false, error: 'No speakable text provided.' }
    if (clean.length > MAX_CHARS) return { success: false, error: `Text too long (${clean.length} chars). Max ${MAX_CHARS}.` }

    const preferredEngine = engine || (await getSetting('live_voice_engine', 'neural'))
    const elevenLabsKey = await getElevenLabsApiKey()

    // Route to ElevenLabs if requested or selected
    if ((preferredEngine === 'elevenlabs' || engine === 'elevenlabs') && elevenLabsKey) {
      try {
        const useVoiceId = voice && !VOICES[voice] ? voice : (await getSetting('voice_elevenlabs_id', DEFAULT_ELEVENLABS_VOICE))
        const res = await synthesizeElevenLabs({ text: clean, voiceId: useVoiceId, apiKey: elevenLabsKey })
        const filename = `yogatik-elevenlabs-${Date.now()}.mp3`
        let mediaId = null
        try { mediaId = await saveMedia({ blob: res.blob, mime: 'audio/mpeg', filename }) } catch { /* transient */ }

        return {
          success: true,
          tool: 'text_to_audio',
          engine: 'elevenlabs',
          media_id: mediaId,
          audio_url: res.audioUrl,
          filename,
          mime: 'audio/mpeg',
          voice: useVoiceId,
          bytes: res.blob.size,
          display: 'The studio-quality ElevenLabs audio is shown to the user with a player and a download button.',
        }
      } catch (e) {
        // Gracefully fall through to on-device Kokoro TTS on cloud failure
        console.warn('ElevenLabs synthesis failed, falling back to on-device voice:', e)
      }
    }

    // Default: On-device Kokoro TTS
    const useVoice = VOICES[voice] ? voice : DEFAULT_VOICE
    let pcmParts = []
    let sampleRate = SAMPLE_RATE
    try {
      const chunks = chunk(clean)
      const silenceLen = Math.round(sampleRate * 0.12) // 120ms natural breathing gap
      const silence = new Float32Array(silenceLen)

      for (let idx = 0; idx < chunks.length; idx++) {
        const part = chunks[idx]
        const { pcm, sampleRate: sr } = await synthesize(part, { voice: useVoice, speed })
        if (pcm?.length) {
          pcmParts.push(pcm)
          if (idx < chunks.length - 1) pcmParts.push(silence)
          sampleRate = sr || sampleRate
        }
      }
    } catch (e) {
      return { success: false, error: `On-device voice could not load: ${e?.message || e}. It needs WebGPU/WASM and a one-time ~90MB download.` }
    }
    if (!pcmParts.length) return { success: false, error: 'The voice produced no audio.' }

    const total = pcmParts.reduce((a, p) => a + p.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const p of pcmParts) { merged.set(p, off); off += p.length }

    // Broadcast vocal polish: Soft-knee compression to tame dynamic peaks and elevate subtle articulation
    for (let i = 0; i < merged.length; i++) {
      const v = merged[i]
      const absV = Math.abs(v)
      if (absV > 0.45) {
        const excess = absV - 0.45
        const compressed = 0.45 + excess * 0.55
        merged[i] = (v < 0 ? -1 : 1) * compressed
      }
    }

    // Peak-normalise to -1 dBFS (0.89)
    let peak = 0
    for (let i = 0; i < merged.length; i++) { const a = Math.abs(merged[i]); if (a > peak) peak = a }
    if (peak > 0) {
      const gain = 0.89 / peak
      if (gain < 4) for (let i = 0; i < merged.length; i++) merged[i] *= gain
    }

    const blob = encodeWav(merged, sampleRate)
    const filename = `yogatik-narration-${Date.now()}.wav`
    let mediaId = null
    try { mediaId = await saveMedia({ blob, mime: 'audio/wav', filename }) } catch { /* transient */ }

    return {
      success: true,
      tool: 'text_to_audio',
      engine: 'kokoro',
      media_id: mediaId,
      audio_url: URL.createObjectURL(blob),
      filename,
      mime: 'audio/wav',
      duration_sec: Number((merged.length / sampleRate).toFixed(1)),
      voice: useVoice,
      bytes: blob.size,
      display: 'The audio is shown to the user with a player and a download button. Do not print a link.',
    }
  },
}
