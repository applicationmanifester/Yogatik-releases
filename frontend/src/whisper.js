/**
 * On-device speech-to-text via Whisper (Transformers.js). Open (MIT), keyless,
 * offline after the first load. Used as a cross-browser fallback for the Web
 * Speech API, which only exists in Chrome/Edge — this brings dictation to
 * Firefox/Safari too. ~40MB (whisper-base) cached after first use.
 */
import { webgpuDevice } from './gpu'

const CDN = 'https://esm.run/@huggingface/transformers@3.7.6'
const MODEL = 'Xenova/whisper-base'
const TARGET_RATE = 16000

let lib = null
let asr = null
let loading = null

export function isWhisperReady() { return !!asr }

async function getASR(onProgress) {
  if (asr) return asr
  if (loading) return loading
  loading = (async () => {
    if (!lib) lib = await import(/* @vite-ignore */ CDN)
    const device = (await webgpuDevice()) === 'webgpu' ? 'webgpu' : 'wasm'
    asr = await lib.pipeline('automatic-speech-recognition', MODEL, {
      device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback: onProgress,
    })
    return asr
  })()
  try { return await loading } finally { loading = null }
}

/** Decode an audio Blob to mono Float32 at 16 kHz (what Whisper expects). */
export async function blobToPcm(blob) {
  const buf = await blob.arrayBuffer()
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const tmp = new (window.AudioContext || window.webkitAudioContext)()
  const decoded = await tmp.decodeAudioData(buf)
  tmp.close?.()
  // Resample to 16k mono via an OfflineAudioContext.
  const frames = Math.ceil(decoded.duration * TARGET_RATE)
  const off = new Ctx(1, frames, TARGET_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}

/** Transcribe an audio Blob to text, entirely on-device. */
export async function transcribe(blob, { lang, onProgress } = {}) {
  const pcm = await blobToPcm(blob)
  const engine = await getASR(onProgress)
  const out = await engine(pcm, {
    chunk_length_s: 30, stride_length_s: 5,
    language: lang && !/^en/i.test(lang) ? lang.split('-')[0] : undefined,
  })
  return (out?.text || '').trim()
}
