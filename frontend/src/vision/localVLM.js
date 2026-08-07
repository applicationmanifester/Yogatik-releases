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

export function isWebGPUAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
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

  loading = (async () => {
    const { AutoProcessor, AutoModelForVision2Seq } = await getLib()
    const webgpu = isWebGPUAvailable()
    const processor = await AutoProcessor.from_pretrained(id, { progress_callback: onProgress })
    const model = await AutoModelForVision2Seq.from_pretrained(id, {
      // fp16 on GPU halves the download and the memory; WASM needs int8 or it
      // is unusably slow on a CPU.
      dtype: webgpu
        ? { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4' }
        : { embed_tokens: 'fp16', vision_encoder: 'q8', decoder_model_merged: 'q8' },
      device: webgpu ? 'webgpu' : 'wasm',
      progress_callback: onProgress,
    })
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
