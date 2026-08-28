/**
 * ollama.js — Renderer-side Ollama manager.
 *
 * Wraps window.__YOGATIK_OLLAMA__ (Electron only) with a clean async API.
 * In the web browser this module is a safe no-op.
 *
 * Typical usage:
 *   import { autoStartOllama, ollamaStatus, pullOllamaModel } from './ollama'
 *
 *   // Call once on app boot (desktop only):
 *   autoStartOllama()
 *
 *   // Render a model picker:
 *   const { models } = await ollamaStatus()
 *
 *   // Download a new model with progress callback:
 *   await pullOllamaModel('llama3.2', ({ percent, status }) => { ... })
 */

const bridge = () => (typeof window !== 'undefined' ? window.__YOGATIK_OLLAMA__ : null)

/** True only when running inside the Electron desktop app. */
export function isDesktopWithOllama() {
  return !!bridge()
}

/**
 * Probe the Ollama installation and daemon.
 * @returns {{ installed: boolean, running: boolean, models: Array, bin: string|null }}
 */
export async function ollamaStatus() {
  const b = bridge()
  if (!b) return { installed: false, running: false, models: [], bin: null }
  try { return await b.status() }
  catch { return { installed: false, running: false, models: [], bin: null } }
}

/**
 * Start the Ollama daemon if it isn't running.
 * Safe to call redundantly — returns immediately if already up.
 * @returns {{ ok: boolean, already: boolean, error?: string }}
 */
export async function startOllamaDaemon() {
  const b = bridge()
  if (!b) return { ok: false, error: 'Not running in Electron' }
  try { return await b.start() }
  catch (e) { return { ok: false, error: e?.message || String(e) } }
}

/**
 * Return the list of models already pulled to the local machine.
 * @returns {Array<{ name: string, size: string, modified: string }>}
 */
export async function listOllamaModels() {
  const b = bridge()
  if (!b) return []
  try { return await b.list() }
  catch { return [] }
}

/**
 * Pull a model from the Ollama registry.
 * Automatically starts the daemon first if needed.
 *
 * @param {string} modelName   e.g. 'llama3.2', 'qwen2.5:3b'
 * @param {(p: { model: string, status: string, percent: number|null }) => void} onProgress
 * @returns {Promise<{ ok: boolean }>}
 */
export async function pullOllamaModel(modelName, onProgress) {
  const b = bridge()
  if (!b) throw new Error('Ollama pull is only available in the desktop app.')

  // Subscribe to progress BEFORE invoking the pull so we never miss the first event.
  let unsub
  if (onProgress) {
    unsub = b.onPullProgress(onProgress)
  }

  try {
    const result = await b.pull(modelName)
    return result
  } finally {
    unsub?.()
  }
}

/**
 * Cancel an in-progress pull.
 */
export async function cancelOllamaPull(modelName) {
  const b = bridge()
  if (!b) return
  try { await b.cancel(modelName) } catch {}
}

/**
 * Called once at app boot (desktop only).
 * 1. Checks if Ollama is installed.
 * 2. If installed but not running → starts the daemon in the background.
 * 3. Returns the status so callers can update the UI without blocking.
 *
 * NEVER throws — all errors are swallowed so a missing Ollama install
 * doesn't break the web build or the non-Ollama workflow.
 */
export async function autoStartOllama() {
  if (!isDesktopWithOllama()) return null
  try {
    const status = await ollamaStatus()
    if (!status.installed) return status          // not installed — no-op
    if (!status.running) {
      // Fire-and-forget: start in background, don't block the boot path
      startOllamaDaemon().then(r => {
        if (!r.ok) console.warn('[ollama] auto-start failed:', r.error)
      }).catch(() => {})
    }
    return status
  } catch {
    return null
  }
}

/**
 * Suggested starter models — curated for quality/size balance.
 * Shown when no models are installed yet.
 */
export const SUGGESTED_MODELS = [
  { name: 'llama3.2',        label: 'Llama 3.2 3B',     size: '~2 GB',  note: 'Best all-rounder for chat & code' },
  { name: 'qwen2.5:3b',     label: 'Qwen 2.5 3B',      size: '~2 GB',  note: 'Strong at multilingual & code' },
  { name: 'gemma3:4b',      label: 'Gemma 3 4B',       size: '~2.5 GB', note: 'Google\'s latest small model' },
  { name: 'phi4-mini',      label: 'Phi-4 Mini',        size: '~2.5 GB', note: 'Microsoft — great reasoning' },
  { name: 'mistral',        label: 'Mistral 7B',        size: '~4 GB',  note: 'Reliable workhorse' },
  { name: 'llama3.2:1b',   label: 'Llama 3.2 1B',     size: '~0.7 GB', note: 'Ultra-fast, low-RAM' },
  { name: 'deepseek-r1:7b', label: 'DeepSeek-R1 7B',  size: '~4.7 GB', note: 'Strong reasoning model' },
]
