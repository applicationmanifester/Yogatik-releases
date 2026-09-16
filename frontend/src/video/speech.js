/**
 * Narration for rendered video.
 *
 * The obvious approach — `speechSynthesis` — is a dead end: the Web Speech API
 * writes straight to the audio device and exposes no MediaStream, no buffer,
 * no way to capture what it said. You cannot mux a sound you are not allowed
 * to hold.
 *
 * So the narrator is a real TTS model running on-device: Kokoro-82M (ONNX,
 * Apache-2.0) via kokoro-js, WebGPU with a wasm fallback. It hands back raw
 * Float32 PCM at 24 kHz, which is exactly what an AudioEncoder wants, so the
 * voice can be muxed into the MP4 as a proper AAC track.
 *
 * ~90MB quantised, cached by the browser after the first render.
 */

import { webgpuDevice } from '../gpu'

const KOKORO_CDN = 'https://esm.run/kokoro-js@1.2.1'
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export const SAMPLE_RATE = 24000

/** A useful spread rather than all 28 — the model picks from these. */export const VOICES = {
  af_heart: 'Warm American female (default)',
  af_nova: 'Bright American female',
  af_sky: 'Sky — calm, female',
  af_bella: 'Bella — lively, female',
  af_sarah: 'Sarah — warm, female',
  af_alloy: 'Alloy — warm',
  af_aoede: 'Aoede — expressive',
  af_jessica: 'Jessica — clear',
  af_kore: 'Kore — balanced',
  af_nicole: 'Nicole — warm',
  af_river: 'River — calm',
  am_michael: 'Steady American male',
  am_puck: 'Lively American male',
  am_adam: 'Adam — steady, male',
  am_ryan: 'Ryan — friendly, male',
  am_echo: 'Echo — steady',
  am_fenrir: 'Fenrir — lively',
  am_liam: 'Liam — friendly',
  am_onyx: 'Onyx — deep',
  am_santa: 'Santa — cheerful',
  bf_emma: 'British female',
  bf_lily: 'Lily — British, female',
  bm_george: 'British male',
  bm_lewis: 'Lewis — British, male',
}

/** Short labels for the settings picker. */export const VOICE_LABELS = {
  af_heart: 'Heart — warm, female',
  af_nova: 'Nova — bright, female',
  af_sky: 'Sky — calm, female',
  af_bella: 'Bella — lively, female',
  af_sarah: 'Sarah — warm, female',
  af_alloy: 'Alloy — warm',
  af_aoede: 'Aoede — expressive',
  af_jessica: 'Jessica — clear',
  af_kore: 'Kore — balanced',
  af_nicole: 'Nicole — warm',
  af_river: 'River — calm',
  am_michael: 'Michael — calm, male',
  am_puck: 'Puck — lively, male',
  am_adam: 'Adam — steady, male',
  am_ryan: 'Ryan — friendly, male',
  am_echo: 'Echo — steady',
  am_fenrir: 'Fenrir — lively',
  am_liam: 'Liam — friendly',
  am_onyx: 'Onyx — deep',
  am_santa: 'Santa — cheerful',
  bf_emma: 'Emma — British, female',
  bf_lily: 'Lily — British, female',
  bm_george: 'George — British, male',
  bm_lewis: 'Lewis — British, male',
}

export const DEFAULT_VOICE = 'af_heart'

let tts = null
let loading = null

const CACHE_FLAG = 'yogatik.narrator.cached'

/**
 * Has this browser downloaded the voice before? The weights live in the
 * browser's HTTP cache, which we cannot inspect, so a flag is dropped after the
 * first successful load. Callers use it to decide whether waiting for the
 * neural voice is reasonable (~1-2s from cache) or rude (~90MB cold).
 */
export function narratorCached() {
  try { return localStorage.getItem(CACHE_FLAG) === '1' } catch { return false }
}

export function isNarratorReady() { return !!tts }

export { webgpuDevice }

/** Download + compile. ~90MB on first call, then served from browser cache. */export async function loadNarrator(onProgress) {
  if (tts) return tts
  if (loading) return loading

  loading = (async () => {
    const { KokoroTTS } = await import(/* @vite-ignore */ KOKORO_CDN)
    const device = await webgpuDevice()
    // fp32 on GPU is 4x the download for no audible gain at 24kHz.
    const load = (dev) => KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: dev === 'webgpu' ? 'fp32' : 'q8',
      device: dev,
      progress_callback: onProgress,
    })
    try {
      tts = await load(device)
    } catch (e) {
      // An adapter that exists but cannot compile the graph is common enough
      // (old drivers, virtualised GPUs) that it must not mean "no voice".
      if (device !== 'webgpu') throw e
      tts = await load('wasm')
    }
    try { localStorage.setItem(CACHE_FLAG, '1') } catch { /* private mode */ }
    return tts
  })()

  try { return await loading } finally { loading = null }
}

export function unloadNarrator() { tts = null }

/** Pre-warm the neural narrator in the background during idle time. */export function prewarmNarrator() {
  if (!tts && !loading && narratorCached()) {
    loadNarrator().catch(() => {})
  }
}

/**
 * Speak one line.
 * @returns {Promise<{pcm: Float32Array, sampleRate: number, seconds: number}>}
 */
export async function synthesize(text, { voice = DEFAULT_VOICE, speed = 1, onProgress } = {}) {
  const clean = cleanForSpeech(text)
  if (!clean) return { pcm: new Float32Array(0), sampleRate: SAMPLE_RATE, seconds: 0 }

  const engine = await loadNarrator(onProgress)
  const audio = await engine.generate(clean, {
    voice: VOICES[voice] ? voice : DEFAULT_VOICE,
    speed: Math.min(1.5, Math.max(0.6, speed)),
  })
  const pcm = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio)
  const sampleRate = audio.sampling_rate || SAMPLE_RATE
  return { pcm, sampleRate, seconds: pcm.length / sampleRate }
}

/**
 * Markdown and URLs are unlistenable — the model writes for the eye, so strip
 * what only makes sense on a page before handing it to a voice.
 */
export function cleanForSpeech(text) {
  return String(text ?? '')
    .replace(/```[\\s\\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}

/**
 * How long a line will take to say, before we have said it. Used to size
 * scenes when narration is planned but the model has not downloaded yet.
 * ~2.6 words/second is a measured average for Kokoro at speed 1.
 */
export function estimateSpeechSeconds(text, speed = 1) {
  const words = cleanForSpeech(text).split(/\s+/).filter(Boolean).length
  if (!words) return 0
  return (words / 2.6) / (speed || 1)
}