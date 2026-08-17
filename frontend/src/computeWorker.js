/**
 * Client for the generic compute worker. `runInWorker(task, payload)` returns a
 * promise resolving with the task result. The worker is lazily created on first
 * use and terminated after an idle period so it costs nothing until needed.
 *
 * Degrades gracefully: if Web Workers are unavailable (old webview, unit tests,
 * SSR) it runs the identical task function inline via the shared TASKS map, so
 * callers get the same result either way and never have to branch.
 */
import { TASKS } from './workers/compute.worker'

const IDLE_TERMINATE_MS = 30_000
const workerSupported = typeof Worker !== 'undefined' && typeof window !== 'undefined'

let _worker = null
let _idleTimer = null
let _seq = 0
const _pending = new Map()

function spawn() {
  if (_worker) return _worker
  // Vite resolves this URL form to a real module worker in the browser build.
  _worker = new Worker(new URL('./workers/compute.worker.js', import.meta.url), { type: 'module' })
  _worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data || {}
    const p = _pending.get(id)
    if (!p) return
    _pending.delete(id)
    ok ? p.resolve(result) : p.reject(new Error(error || 'Worker task failed'))
    scheduleIdleTerminate()
  }
  _worker.onerror = () => {
    for (const p of _pending.values()) p.reject(new Error('Worker crashed'))
    _pending.clear()
    terminateWorker()
  }
  return _worker
}

function scheduleIdleTerminate() {
  clearTimeout(_idleTimer)
  if (_pending.size > 0) return
  _idleTimer = setTimeout(terminateWorker, IDLE_TERMINATE_MS)
}

export function terminateWorker() {
  clearTimeout(_idleTimer)
  if (_worker) { try { _worker.terminate() } catch { /* ignore */ } }
  _worker = null
}

/** Run a named task off-thread (or inline if unsupported). */
export async function runInWorker(task, payload) {
  const fn = TASKS[task]
  if (!fn) throw new Error(`Unknown task: ${task}`)
  if (!workerSupported) return fn(payload) // inline fallback

  const w = spawn()
  const id = ++_seq
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject })
    try { w.postMessage({ id, task, payload }) }
    catch (err) { _pending.delete(id); reject(err) }
  })
}

/** True when real off-thread execution is available (for callers that care). */
export const isWorkerOffloadAvailable = workerSupported
