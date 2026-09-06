/**
 * On-device inference via WebLLM (WebGPU).
 *
 * The model weights are ~750MB, so nothing is fetched until the user explicitly
 * asks for it. Once cached by the browser it works with no key and no network —
 * the only configuration in the app that is genuinely offline end to end.
 */

const CDN = 'https://esm.run/@mlc-ai/web-llm'

export const LOCAL_MODELS = {
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    label: 'Qwen 2.5 0.5B (Ultra Fast)',
    size: '~350 MB',
    note: 'Super fast, smart for general questions and fast chat.',
  },
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    label: 'Llama 3.2 1B (Balanced)',
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

export const DEFAULT_LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'

const _engineMap = new Map()
let _loadingByModel = new Map()

/** WebGPU is required; Safari and Firefox only shipped it recently. */
export function webGpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export async function webGpuDetails() {
  if (!webGpuAvailable()) {
    return { available: false, reason: 'This browser has no WebGPU. Chrome or Edge 113+, Chrome on Android 121+, or Safari 26+ are needed.' }
  }
  try {
    let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null)
    if (!adapter) {
      adapter = await navigator.gpu.requestAdapter().catch(() => null)
    }
    if (!adapter) return { available: false, reason: 'WebGPU is present but no GPU adapter was offered — often the case in VMs or with GPU acceleration disabled.' }
    return { available: true, adapter: adapter.info?.description || adapter.info?.vendor || 'GPU' }
  } catch (e) {
    return { available: false, reason: e.message }
  }
}

export function isLocalReady(model = DEFAULT_LOCAL_MODEL) {
  return _engineMap.has(model)
}

/**
 * Load (and on first run, download) the weights. Caller must have consent.
 * @param {(p:{progress:number,text:string}) => void} onProgress
 */
export async function loadLocalModel(model = DEFAULT_LOCAL_MODEL, onProgress) {
  if (_engineMap.has(model)) return _engineMap.get(model)
  if (_loadingByModel.has(model)) return _loadingByModel.get(model)

  const promise = (async () => {
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
    _engineMap.set(model, engine)
    return engine
  })()

  _loadingByModel.set(model, promise)
  try {
    return await promise
  } finally {
    _loadingByModel.delete(model)
  }
}

/** Free GPU memory; cached weights stay on disk for next time. */
export async function unloadLocalModel(model = null) {
  if (model) {
    const eng = _engineMap.get(model)
    if (eng) {
      try { await eng.unload?.() } catch { /* best effort */ }
      _engineMap.delete(model)
    }
  } else {
    for (const [m, eng] of _engineMap.entries()) {
      try { await eng.unload?.() } catch { /* best effort */ }
    }
    _engineMap.clear()
  }
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
export async function streamLocal({ model = DEFAULT_LOCAL_MODEL, messages, temperature = 1.0, tools = null, signal, onToken, onToolCall, onDone, onError, onStatus }) {
  try {
    if (signal?.aborted) { onDone?.(); return }

    // Hold the engine this turn loaded. Reading the module-level _engine after
    // an await means a concurrent model switch nulls it mid-turn.
    let engine = _engineMap.get(model)
    if (!engine) {
      onStatus?.('Initializing on-device AI model…')
      engine = await loadLocalModel(model, (p) => {
        const pct = Math.round((p.progress || 0) * 100)
        onStatus?.(`Loading model weights (${pct}%): ${p.text || ''}`)
      })
    }
    if (!engine) throw new Error('On-device model failed to load')

    if (signal?.aborted) { onDone?.(); return }

    const abortHandler = () => {
      try { engine.interruptGenerate?.() } catch { /* best effort */ }
    }
    signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      const req = {
        messages,
        temperature,
        top_p: 0.9,
        repetition_penalty: 1.15,
        max_tokens: 1024,
        stream: true,
      }
      // Small on-device models (0.5B/1B) cannot drive native function calling.
      // Disabled in api.js; never inject here so the stream isn't broken.

      const chunks = await engine.chat.completions.create(req)

      let toolCalls = {}

      for await (const chunk of chunks) {
        if (signal?.aborted) {
          try { await engine.interruptGenerate?.() } catch { /* best effort */ }
          break
        }
        
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        
        if (delta.content) onToken?.(delta.content)

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', arguments: '' }
            if (tc.id) toolCalls[idx].id = tc.id
            if (tc.function?.name) toolCalls[idx].name = tc.function.name
            if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
          }
        }
      }

      for (const tc of Object.values(toolCalls)) {
        if (tc.name) {
          try { tc.parsedArgs = JSON.parse(tc.arguments) } catch { tc.parsedArgs = {} }
          onToolCall?.(tc)
        }
      }
    } finally {
      signal?.removeEventListener('abort', abortHandler)
    }

    onDone?.()
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) onDone?.()
    else onError?.(err)
  }
}
