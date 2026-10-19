/**
 * heavyToolsWorkerClient — lazy, shared Web Worker for heavy on-device tools.
 *
 * Pyodide (multi-MB WASM), Tesseract (~15MB traineddata) and the video encode
 * path must never run on the main thread: they jank the composer, drop live
 * frames, and stall streaming tokens. This module is the single choke point
 * for off-main-thread heavy work:
 *
 * - The worker is created LAZILY on first use, never at import/startup, so the
 *   first paint pays nothing for tools the user may never touch.
 * - Requests are multiplexed by id over postMessage; ArrayBuffers ride as
 *   transferables (zero-copy) instead of being structured-cloned.
 * - Stateful kernels stay alive in the worker across calls (Pyodide globals,
 *   Tesseract worker); the main thread holds no heavy state to leak.
 * - When Workers are unavailable (jsdom tests, rare embeds) callers get a
 *   clear `workerUnavailable` signal and fall back to their (slower)
 *   main-thread path rather than crashing.
 */

let workerRef = null
let seq = 0
const pending = new Map()

function workerUrl() {
  // Vite serves public/ at root in dev and build; the desktop file:// build
  // resolves relative to the page instead.
  try {
    return new URL('/worker-heavy.js', window.location.origin).toString()
  } catch {
    return '/worker-heavy.js'
  }
}

export function workerSupported() {
  return typeof window !== 'undefined' && typeof window.Worker !== 'undefined'
}

/** Lazily create (or return) the shared heavy worker. Null when unsupported. */
export function getHeavyWorker() {
  if (!workerSupported()) return null
  if (workerRef) return workerRef
  try {
    workerRef = new window.Worker(workerUrl())
  } catch {
    return null
  }
  workerRef.onmessage = (e) => {
    const { id, ...rest } = e?.data || {}
    if (id == null) return
    const call = pending.get(id)
    if (!call) return
    pending.delete(id)
    clearTimeout(call.timer)
    if (rest.success === false || rest.type === 'error') {
      call.reject(new Error(rest.error || 'Heavy worker failed'))
    } else {
      call.resolve(rest)
    }
  }
  workerRef.onerror = (err) => {
    // Fail every in-flight call loudly; the next call recreates the worker.
    const list = [...pending.values()]
    pending.clear()
    try { workerRef?.terminate() } catch { /* gone */ }
    workerRef = null
    for (const { reject } of list) reject(err instanceof Error ? err : new Error('Heavy worker error'))
  }
  return workerRef
}

/**
 * Send one request to the heavy worker.
 * @param {string} type message type the worker switches on
 * @param {object} payload JSON-serialisable fields
 * @param {{ transfer?: Transferable[], timeoutMs?: number }} opts
 */
export function callHeavyWorker(type, payload = {}, { transfer, timeoutMs = 120_000 } = {}) {
  const worker = getHeavyWorker()
  if (!worker) return Promise.reject(Object.assign(new Error('Web Workers unavailable'), { workerUnavailable: true }))
  const id = `hw_${Date.now().toString(36)}_${(seq++).toString(36)}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('Heavy worker timed out'))
      }
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      worker.postMessage({ id, type, ...payload }, transfer || [])
    } catch (e) {
      pending.delete(id)
      clearTimeout(timer)
      reject(e)
    }
  })
}

/** Tear down the shared worker (tests, memory pressure). In-flight calls fail. */
export function terminateHeavyWorker() {
  try { workerRef?.terminate() } catch { /* gone */ }
  workerRef = null
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer)
    reject(new Error('Heavy worker terminated'))
  }
  pending.clear()
}

export function _resetForTests() {
  terminateHeavyWorker()
  seq = 0
}
