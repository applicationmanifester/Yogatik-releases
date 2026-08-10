/**
 * On-device vision model — Transformers.js + WebGPU, no API key, no network
 * after the first download.
 *
 * SmolVLM-256M is ~230MB quantised and answers in ~1-2s on an integrated GPU.
 * That is the difference between "vision requires Gemini" and "vision always
 * works, and gets better if you bring a key".
 *
 * Loaded from esm.run rather than npm for the same reason as WebLLM: it keeps
 * ~40MB of ONNX runtime out of the bundle for the users who never enable it.
 */

import { webgpuDevice } from '../gpu'

const CDN = 'https://esm.run/@huggingface/transformers@3.7.6'

export const LOCAL_VLM_MODELS = {
  'HuggingFaceTB/SmolVLM-256M-Instruct': {
    label: 'SmolVLM 256M', sizeMB: 230,
    note: 'Fast. Describes scenes, reads large text, counts objects.',
  },
  'HuggingFaceTB/SmolVLM-500M-Instruct': {
    label: 'SmolVLM 500M', sizeMB: 460,
    note: 'Noticeably better at detail and small text. Needs WebGPU.',
  },
}
export const DEFAULT_LOCAL_VLM = 'HuggingFaceTB/SmolVLM-256M-Instruct'

let lib = null
let loaded = null          // { id, processor, model }
let loading = null
let consented = false

/**
 * Downloading 230MB is a decision, not a fallback. The blind-model path used to
 * call straight into loadLocalVLM, so asking "what am I holding" on a provider
 * without vision pulled the weights with nothing on screen to say so.
 * App mirrors the `localVision` feature toggle in here.
 */
export function setLocalVLMConsent(v) { consented = !!v }

/** True once the weights are in the Transformers.js cache — then it is free. */
export async function isLocalVLMCached(id = DEFAULT_LOCAL_VLM) {
  if (typeof caches === 'undefined') return false
  try {
    for (const name of await caches.keys()) {
      if (!/transformers/i.test(name)) continue
      const cache = await caches.open(name)
      const hit = (await cache.keys()).some(r => r.url.includes(id))
      if (hit) return true
    }
  } catch { /* opaque storage: assume not cached */ }
  return false
}

/** Kept for callers; the real probe asks for an adapter (see gpu.js). */
export async function isWebGPUAvailable() {
  return (await webgpuDevice()) === 'webgpu'
}

export function isLocalVLMReady(id = DEFAULT_LOCAL_VLM) {
  return loaded?.id === id
}

async function getLib() {
  if (!lib) lib = await import(/* @vite-ignore */ CDN)
  return lib
}

/**
 * Download + compile. Never called without explicit user consent — this pulls
 * hundreds of megabytes.
 * @param {Function} onProgress ({file, progress, status}) => void
 */
export async function loadLocalVLM(id = DEFAULT_LOCAL_VLM, onProgress) {
  if (loaded?.id === id) return loaded
  if (loading) return loading
  if (!consented && !(await isLocalVLMCached(id))) {
    throw new Error('On-device vision is off. Turn on "On-device vision" in Personalise to download the model (~230MB, once).')
  }

  loading = (async () => {
    const { AutoProcessor, AutoModelForVision2Seq } = await getLib()
    const webgpu = (await webgpuDevice()) === 'webgpu'
    const processor = await AutoProcessor.from_pretrained(id, { progress_callback: onProgress })
    const load = (gpu) => AutoModelForVision2Seq.from_pretrained(id, {
      // fp16 on GPU halves the download and the memory; WASM needs int8 or it
      // is unusably slow on a CPU.
      dtype: gpu
        ? { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' }
        : { embed_tokens: 'fp16', vision_encoder: 'q8', decoder_model_merged: 'q8' },
      device: gpu ? 'webgpu' : 'wasm',
      progress_callback: onProgress,
    })
    let model
    try {
      model = await load(webgpu)
    } catch (e) {
      if (!webgpu) throw e
      model = await load(false)   // adapter exists but cannot run it
    }
    loaded = { id, processor, model }
    return loaded
  })()

  try { return await loading } finally { loading = null }
}

export function unloadLocalVLM() {
  try { loaded?.model?.dispose?.() } catch {}
  loaded = null
}

/**
 * Answer a question about one image, entirely on-device.
 * @param {string} image  data URL or http(s) URL
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askLocalVLM(image, question = 'Describe what you see, briefly and concretely.', {
  id = DEFAULT_LOCAL_VLM, maxTokens = 128, onProgress,
} = {}) {
  const { processor, model } = await loadLocalVLM(id, onProgress)
  const { RawImage } = await getLib()

  const img = await RawImage.read(image)
  const messages = [{
    role: 'user',
    content: [{ type: 'image' }, { type: 'text', text: question }],
  }]
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true })
  const inputs = await processor(text, [img], { do_image_splitting: false })

  const ids = await model.generate({ ...inputs, max_new_tokens: maxTokens, do_sample: false })
  const out = processor.batch_decode(
    // Strip the prompt tokens; otherwise the reply repeats the whole template.
    ids.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true },
  )
  return (out[0] || '').trim()
}
