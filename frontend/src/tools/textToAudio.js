/**
 * text_to_audio — turn text into a downloadable narrated audio file (WAV),
 * spoken by the on-device Kokoro voice. Open (Apache-2.0 model), keyless, runs
 * entirely in the browser. Reuses the exact TTS pipeline the video narrator uses.
 *
 * Unlike the `tts` tool (which plays through the speakers and returns nothing to
 * hold), this produces a real file the user can save, share, or replay — a
 * single-voice "audio overview" of any text.
 */

import { synthesize, cleanForSpeech, VOICES, DEFAULT_VOICE, SAMPLE_RATE } from '../video/speech'
import { saveMedia } from '../db'

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
      'Narrate text into a downloadable audio file (WAV) using an on-device voice — no key, no cloud. ' +
      'Use when the user wants to LISTEN to something as a file: an audio summary, a read-aloud of an article, ' +
      'a spoken note, or a single-voice "audio overview". For a quick speak-aloud with no file, use tts instead.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to narrate. Plain prose reads best.' },
        voice: { type: 'string', enum: Object.keys(VOICES), description: Object.entries(VOICES).map(([k, v]) => `${k}: ${v}`).join('; ') },
        speed: { type: 'number', description: 'Speaking speed 0.6-1.5 (default 1)' },
      },
      required: ['text'],
    },
  },
  async execute({ text, voice, speed = 1 }) {
    const clean = cleanForSpeech(text)
    if (!clean) return { success: false, error: 'No speakable text provided.' }
    if (clean.length > MAX_CHARS) return { success: false, error: `Text too long (${clean.length} chars). Max ${MAX_CHARS}.` }

    const useVoice = VOICES[voice] ? voice : DEFAULT_VOICE
    let pcmParts = []
    let sampleRate = SAMPLE_RATE
    try {
      for (const part of chunk(clean)) {
        const { pcm, sampleRate: sr } = await synthesize(part, { voice: useVoice, speed })
        if (pcm?.length) { pcmParts.push(pcm); sampleRate = sr || sampleRate }
      }
    } catch (e) {
      return { success: false, error: `On-device voice could not load: ${e?.message || e}. It needs WebGPU/WASM and a one-time ~90MB download.` }
    }
    if (!pcmParts.length) return { success: false, error: 'The voice produced no audio.' }

    const total = pcmParts.reduce((a, p) => a + p.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const p of pcmParts) { merged.set(p, off); off += p.length }

    // Peak-normalise to -1 dBFS so narration is at a consistent, healthy volume.
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
