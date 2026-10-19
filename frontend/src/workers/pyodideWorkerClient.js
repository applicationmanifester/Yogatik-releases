/**
 * pyodideWorkerClient — plain (non-React) client for /worker-pyodide.js.
 *
 * tools/codeExec.js runs outside React, so it cannot use hooks/usePyodide.
 * This is the same protocol the hook speaks — multiplexed postMessage by id,
 * stateful kernel (the worker's Pyodide instance and globals persist across
 * calls like a Jupyter kernel) — without the React dependency.
 */

let workerRef = null
let seq = 0
const pending = new Map()
let workerReady = false

export function pyodideWorkerSupported() {
  return typeof window !== 'undefined' && typeof window.Worker !== 'undefined'
}

function workerUrl() {
  try {
    return new URL('/worker-pyodide.js', window.location.origin).toString()
  } catch {
    return '/worker-pyodide.js'
  }
}

export function getPyodideWorker() {
  if (!pyodideWorkerSupported()) return null
  if (workerRef) return workerRef
  try {
    workerRef = new window.Worker(workerUrl(), { type: 'module' })
  } catch {
    return null
  }
  workerRef.onmessage = (e) => {
    const { id, type, success, result, error, data, packages } = e?.data || {}
    if (type === 'worker-loaded' || type === 'ready') {
      workerReady = true
      return
    }
    if (id == null) return
    const call = pending.get(id)
    if (!call) return
    pending.delete(id)
    clearTimeout(call.timer)
    if (type === 'error' || success === false) {
      call.reject(new Error(error || 'Pyodide execution failed'))
    } else {
      call.resolve({ success: true, result, data, packages })
    }
  }
  workerRef.onerror = (err) => {
    const list = [...pending.values()]
    pending.clear()
    try { workerRef?.terminate() } catch { /* gone */ }
    workerRef = null
    workerReady = false
    for (const { reject } of list) reject(err instanceof Error ? err : new Error('Pyodide worker error'))
  }
  return workerRef
}

export function isPyodideWorkerReady() {
  return workerReady
}

/** Run Python in the stateful worker kernel. Rejects with `workerUnavailable`. */
export function runPyodideInWorker(code, packages = [], { timeoutMs = 120_000 } = {}) {
  const worker = getPyodideWorker()
  if (!worker) {
    return Promise.reject(Object.assign(new Error('Web Workers unavailable'), { workerUnavailable: true }))
  }
  const id = `py_${Date.now().toString(36)}_${(seq++).toString(36)}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('Pyodide execution timed out'))
      }
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      worker.postMessage({ id, type: 'run', code, packages })
    } catch (e) {
      pending.delete(id)
      clearTimeout(timer)
      reject(e)
    }
  })
}

export function terminatePyodideWorker() {
  try { workerRef?.terminate() } catch { /* gone */ }
  workerRef = null
  workerReady = false
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer)
    reject(new Error('Pyodide worker terminated'))
  }
  pending.clear()
}

export function _resetForTests() {
  terminatePyodideWorker()
  seq = 0
}
