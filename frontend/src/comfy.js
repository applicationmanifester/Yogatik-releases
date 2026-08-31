/**
 * comfy.js — Renderer-side ComfyUI manager.
 *
 * Wraps window.__YOGATIK_COMFY__ (Electron only) with a clean async API, the
 * same shape as ollama.js. In the browser build, and before a folder has been
 * pointed at, every call is a safe no-op that reports unavailability rather
 * than throwing.
 */

const bridge = () => (typeof window !== 'undefined' ? window.__YOGATIK_COMFY__ : null)

/** True only when running inside the Electron desktop app. */
export function isDesktopWithComfy() {
  return !!bridge()
}

/**
 * Probe ComfyUI's install/run state.
 * @returns {{ installed: boolean, running: boolean, root: string|null, port: number,
 *             checkpoints: string[], svdCheckpoints: string[], samplers: string[], schedulers: string[] }}
 */
export async function comfyStatus() {
  const b = bridge()
  const empty = { installed: false, running: false, root: null, port: 8188, checkpoints: [], svdCheckpoints: [], samplers: [], schedulers: [] }
  if (!b) return empty
  try { return await b.status() } catch { return empty }
}

/** Point Yogatik at an existing ComfyUI folder. Validates before saving. */
export async function setComfyRoot(root) {
  const b = bridge()
  if (!b) return { ok: false, error: 'Not running in the desktop app.' }
  try { return await b.setRoot(root) } catch (e) { return { ok: false, error: e?.message || String(e) } }
}

/** Start the managed ComfyUI process if a root is configured and nothing answers. */
export async function startComfy() {
  const b = bridge()
  if (!b) return { ok: false, error: 'Not running in the desktop app.' }
  try { return await b.start() } catch (e) { return { ok: false, error: e?.message || String(e) } }
}

/**
 * txt2img. Returns { success, bytes (base64 PNG), mime, filename, seed, width, height, error? }.
 */
export async function generateComfyImage(args) {
  const b = bridge()
  if (!b) return { success: false, error: 'Local image generation runs only in the Yogatik desktop app, with ComfyUI installed.' }
  try { return await b.generateImage(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
}

/**
 * img2vid (Stable Video Diffusion). Returns { success, bytes (base64 WEBP), mime,
 * filename, seed, fps, frames, error? }.
 */
export async function generateComfyVideo(args) {
  const b = bridge()
  if (!b) return { success: false, error: 'Local video generation runs only in the Yogatik desktop app, with ComfyUI installed.' }
  try { return await b.generateVideo(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
}

/** Best-effort interrupt of whatever ComfyUI is currently generating. */
export async function cancelComfy() {
  const b = bridge()
  if (!b) return
  try { await b.cancel() } catch { /* best effort */ }
}

/** Subscribe to coarse progress phases ('queued' | 'uploading' | 'fetching'). */
export function onComfyProgress(cb) {
  const b = bridge()
  if (!b) return () => {}
  return b.onProgress(cb)
}
