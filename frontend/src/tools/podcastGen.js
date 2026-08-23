/**
 * `podcast_generate` — Create dynamic multi-speaker audio discussions & podcasts.
 * 
 * Supports two distinct vocal personas (Host & Co-host/Expert) using ElevenLabs
 * cloud studio voices or local Kokoro neural voices.
 * Takes a multi-speaker dialog script or topic overview and merges them into a
 * continuous, high-fidelity audio episode stored in the local media library.
 */

import { synthesizeElevenLabs, getElevenLabsApiKey, DEFAULT_ELEVENLABS_VOICE } from './elevenLabs'
import { synthesize, cleanForSpeech, VOICES, DEFAULT_VOICE, SAMPLE_RATE } from '../video/speech'
import { saveMedia, getSetting } from '../db'

const DEFAULT_HOST_VOICE_ELEVEN = '21m00Tcm4TlvDq8ikWAM' // Rachel (Calm host)
const DEFAULT_GUEST_VOICE_ELEVEN = 'pNInz6obpgDQGcFmaJgB' // Adam (Smooth co-host)

const DEFAULT_HOST_VOICE_KOKORO = 'af_heart'
const DEFAULT_GUEST_VOICE_KOKORO = 'am_adam'

/** Float32 PCM → 16-bit mono WAV Blob */
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

export const podcastGenerateTool = {
  schema: {
    description:
      'Generate a multi-speaker audio podcast / conversational overview (Host & Guest discussion) ' +
      'from a topic or script using studio ElevenLabs voices or on-device neural voices. ' +
      'Produces a complete playable and downloadable podcast audio file.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title or topic of the podcast episode' },
        dialogue: {
          type: 'array',
          description: 'Turn-by-turn conversational lines between speakers',
          items: {
            type: 'object',
            properties: {
              speaker: { type: 'string', enum: ['Host', 'Guest'], description: 'Speaker role: Host or Guest' },
              text: { type: 'string', description: 'Spoken line' },
            },
            required: ['speaker', 'text'],
          },
        },
        engine: { type: 'string', enum: ['elevenlabs', 'kokoro', 'auto'], description: 'Speech engine preference' },
      },
      required: ['title', 'dialogue'],
    },
  },
  async execute({ title, dialogue, engine = 'auto' }) {
    if (!Array.isArray(dialogue) || dialogue.length === 0) {
      return { success: false, error: 'Dialogue must be an array of speaker turns.' }
    }

    const elevenLabsKey = await getElevenLabsApiKey()
    const useEleven = (engine === 'elevenlabs' || (engine === 'auto' && elevenLabsKey)) && Boolean(elevenLabsKey)

    // ElevenLabs multi-speaker audio path
    if (useEleven) {
      try {
        const hostVoice = (await getSetting('voice_elevenlabs_host_id')) || DEFAULT_HOST_VOICE_ELEVEN
        const guestVoice = (await getSetting('voice_elevenlabs_guest_id')) || DEFAULT_GUEST_VOICE_ELEVEN

        const audioBlobs = []
        for (const line of dialogue) {
          const cleanText = cleanForSpeech(line.text)
          if (!cleanText) continue
          const vId = line.speaker?.toLowerCase() === 'guest' ? guestVoice : hostVoice
          const res = await synthesizeElevenLabs({
            text: cleanText,
            voiceId: vId,
            apiKey: elevenLabsKey,
          })
          if (res?.blob) audioBlobs.push(res.blob)
        }

        if (audioBlobs.length > 0) {
          const mergedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' })
          const filename = `podcast-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.mp3`
          let mediaId = null
          try { mediaId = await saveMedia({ blob: mergedBlob, mime: 'audio/mpeg', filename }) } catch {}

          return {
            success: true,
            tool: 'podcast_generate',
            title,
            engine: 'elevenlabs',
            media_id: mediaId,
            audio_url: URL.createObjectURL(mergedBlob),
            filename,
            mime: 'audio/mpeg',
            speaker_count: 2,
            turns: dialogue.length,
            bytes: mergedBlob.size,
            display: `Generated studio-quality ElevenLabs podcast: "${title}" with ${dialogue.length} conversational turns.`,
          }
        }
      } catch (e) {
        console.warn('ElevenLabs podcast generation error, falling back to Kokoro on-device:', e)
      }
    }

    // On-device Kokoro Fallback
    try {
      const hostVoice = DEFAULT_HOST_VOICE_KOKORO
      const guestVoice = DEFAULT_GUEST_VOICE_KOKORO
      let sampleRate = SAMPLE_RATE
      const pcmParts = []
      const silence = new Float32Array(Math.round(sampleRate * 0.25)) // 250ms gap between speakers

      for (let i = 0; i < dialogue.length; i++) {
        const line = dialogue[i]
        const cleanText = cleanForSpeech(line.text)
        if (!cleanText) continue
        const vId = line.speaker?.toLowerCase() === 'guest' ? guestVoice : hostVoice
        const { pcm, sampleRate: sr } = await synthesize(cleanText, { voice: vId })
        if (pcm?.length) {
          pcmParts.push(pcm)
          if (i < dialogue.length - 1) pcmParts.push(silence)
          sampleRate = sr || sampleRate
        }
      }

      if (!pcmParts.length) {
        return { success: false, error: 'Could not generate podcast audio clips.' }
      }

      const total = pcmParts.reduce((a, p) => a + p.length, 0)
      const merged = new Float32Array(total)
      let off = 0
      for (const p of pcmParts) { merged.set(p, off); off += p.length }

      const blob = encodeWav(merged, sampleRate)
      const filename = `podcast-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.wav`
      let mediaId = null
      try { mediaId = await saveMedia({ blob, mime: 'audio/wav', filename }) } catch {}

      return {
        success: true,
        tool: 'podcast_generate',
        title,
        engine: 'kokoro',
        media_id: mediaId,
        audio_url: URL.createObjectURL(blob),
        filename,
        mime: 'audio/wav',
        duration_sec: Number((merged.length / sampleRate).toFixed(1)),
        speaker_count: 2,
        turns: dialogue.length,
        bytes: blob.size,
        display: `Generated on-device podcast: "${title}" with ${dialogue.length} conversational turns.`,
      }
    } catch (e) {
      return { success: false, error: `Podcast generation failed: ${e?.message || e}` }
    }
  },
}
