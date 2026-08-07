/**
 * On-device inference via WebLLM (WebGPU).
 *
 * The model weights are ~750MB, so nothing is fetched until the user explicitly
 * asks for it. Once cached by the browser it works with no key and no network —
 * the only configuration in the app that is genuinely offline end to end.
 */

const CDN = 'https://esm.run/@mlc-ai/web-llm'

export const LOCAL_MODELS = {
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    label: 'Llama 3.2 1B',
    size: '~750 MB',
    note: 'Fast, good for chat and short tasks. Weakest at code and maths.',
  },
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': {
    label: 'Llama 3.2 3B',
    size: '~1.7 GB',
    note: 'Noticeably better answers, slower on integrated GPUs.',
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    label: 'Qwen 2.5 1.5B',
    size: '~950 MB',
    note: 'Stronger at code and other languages than Llama 1B.',
  },
}

export const DEFAULT_LOCAL_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

let _engine = null
let _engineModel = null
let _loading = null

/** WebGPU is required; Safari and Firefox only shipped it recently. */
export function webGpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export async function webGpuDetails() {
  if (!webGpuAvailable()) {
    return { available: false, reason: 'This browser has no WebGPU. Chrome or Edge 113+, Chrome on Android 121+, or Safari 26+ are needed.' }
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { available: false, reason: 'WebGPU is present but no GPU adapter was offered — often the case in VMs or with GPU acceleration disabled.' }
    return { available: true, adapter: adapter.info?.description || adapter.info?.vendor || 'GPU' }
  } catch (e) {
    return { available: false, reason: e.message }
  }
}

export function isLocalReady(model = DEFAULT_LOCAL_MODEL) {
  return !!_engine && _engineModel === model
}

/**
 * Load (and on first run, download) the weights. Caller must have consent.
 * @param {(p:{progress:number,text:string}) => void} onProgress
 */
export async function loadLocalModel(model = DEFAULT_LOCAL_MODEL, onProgress) {
  if (isLocalReady(model)) return _engine
  if (_loading) return _loading

  _loading = (async () => {
    const gpu = await webGpuDetails()
    if (!gpu.available) throw new Error(gpu.reason)

    const webllm = await import(/* @vite-ignore */ CDN)
    const engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (r) => {
        onProgress?.({
          progress: typeof r.progress === 'number' ? r.progress : 0,
          text: r.text || 'Preparing…',
        })
      },
    })
    _engine = engine
    _engineModel = model
    return engine
  })()

  try {
    return await _loading
  } finally {
    _loading = null
  }
}

/** Free GPU memory; cached weights stay on disk for next time. */
export async function unloadLocalModel() {
  try { await _engine?.unload?.() } catch { /* nothing useful to do */ }
  _engine = null
  _engineModel = null
}

/** Delete the cached weights so the browser reclaims the disk space. */
export async function clearLocalModelCache() {
  await unloadLocalModel()
  if (!('caches' in window)) return 0
  const keys = await caches.keys()
  const mlc = keys.filter(k => /webllm|mlc/i.test(k))
  await Promise.all(mlc.map(k => caches.delete(k)))
  return mlc.length
}

/** Rough check for weights already in the HTTP cache, so the UI can say "ready". */
export async function isLocalModelCached() {
  if (!('caches' in window)) return false
  const keys = await caches.keys()
  return keys.some(k => /webllm|mlc/i.test(k))
}

/**
 * Streaming completion with the same shape the rest of the app expects.
 * Tool calling is deliberately not offered: 1B-class models call tools badly,
 * and a wrong call is worse than no call.
 */
export async function streamLocal({ messages, temperature = 0.7, signal, onToken, onDone, onError }) {
  try {
    if (!_engine) throw new Error('The on-device model is not loaded yet.')

    const chunks = await _engine.chat.completions.create({
      messages,
      temperature,
      stream: true,
    })

    for await (const chunk of chunks) {
      if (signal?.aborted) {
        try { await _engine.interruptGenerate?.() } catch { /* best effort */ }
        break
      }
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) onToken?.(delta)
    }
    onDone?.()
  } catch (err) {
    if (err?.name === 'AbortError') onDone?.()
    else onError?.(err)
  }
}
