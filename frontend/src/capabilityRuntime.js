/**
 * The impure half of capabilities.js: asks each engine whether it is actually
 * usable right now, without downloading anything to find out.
 *
 * Kept separate so the decision logic stays testable with no models, no DOM and
 * no network — the same split as rootsCore/roots, maskOps/sam and
 * imageStats/preprocess.
 *
 * EVERY PROBE HERE MUST BE FREE. A readiness check that triggers a 230MB
 * download is the exact failure the "a download is a decision" rule exists to
 * prevent, and it would fire on app start, before anything is on screen.
 */
import { MODE, offlineReport, missingDownloads, capabilityBlock, resolveCapability } from './capabilities'
import { getSetting } from './db'
import { isDesktop } from './tools/localFs'

/** The user's choice. Stored in chat_prefs so it travels with the rest of them. */
export async function getCapabilityMode() {
  try {
    const prefs = (await getSetting('chat_prefs', {})) || {}
    const m = prefs.capability_mode
    return Object.values(MODE).includes(m) ? m : MODE.AUTO
  } catch { return MODE.AUTO }
}

/**
 * Which engines can serve right now, keyed by engine id.
 *
 * `navigator.onLine` is famously only reliable in the negative: false means
 * definitely offline, true means "there is a network interface", not "the
 * internet works". Used only to skip remote engines when it is false, never to
 * claim connectivity.
 */
export async function probeReadiness() {
  const desktop = isDesktop()
  const ready = new Set()

  // --- chat -----------------------------------------------------------------
  // Cached verdicts and cheap globals only; no probe requests.
  try {
    if (desktop) {
      // The CACHED probe result only. `__YOGATIK_OLLAMA__.status()` is an IPC
      // round-trip that can wake or wait on the daemon, and this runs on the
      // startup path — testProvider already writes status_<id>, so read that.
      // Deliberately not calling a bridge method here: a readiness check that
      // does real work is how a probe becomes a hang.
      const st = await getSetting('status_ollama', null)
      if (st?.ok) ready.add('ollama')
    }
    const { isLocalReady, DEFAULT_LOCAL_MODEL, webGpuAvailable } = await import('./localLLM')
    if (webGpuAvailable() && isLocalReady(DEFAULT_LOCAL_MODEL)) ready.add('webllm')
  } catch { /* absent engine is simply not ready */ }

  try {
    const { hasAnyProviderKey } = await import('./api')
    if (await hasAnyProviderKey()) ready.add('cloud')
  } catch { /* no key, not ready */ }

  // --- speech in ------------------------------------------------------------
  try {
    const { isWhisperReady } = await import('./whisper')
    if (isWhisperReady()) ready.add('whisper')
  } catch { /* not loaded */ }
  if (typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)) ready.add('webspeech')

  // --- speech out -----------------------------------------------------------
  try {
    const { narratorCached, isNarratorReady } = await import('./video/speech')
    if (isNarratorReady() || narratorCached()) ready.add('kokoro')
  } catch { /* not loaded */ }
  if (typeof window !== 'undefined' && window.speechSynthesis) ready.add('system')

  // --- vision ---------------------------------------------------------------
  // Tesseract is bundled and pulls its traineddata on first use; treat it as
  // available wherever there is a document to render a canvas into.
  if (typeof document !== 'undefined') ready.add('ocr')
  try {
    const { isLocalVLMReady, isLocalVLMCached, DEFAULT_LOCAL_VLM } = await import('./vision/localVLM')
    if (isLocalVLMReady(DEFAULT_LOCAL_VLM) || await isLocalVLMCached(DEFAULT_LOCAL_VLM)) ready.add('localvlm')
  } catch { /* not consented or not cached */ }
  if (ready.has('cloud')) ready.add('model')

  // --- retrieval ------------------------------------------------------------
  ready.add('bm25')     // pure code, always there
  ready.add('vault')    // IndexedDB; empty is a result, not an outage
  if (ready.has('cloud') && typeof navigator !== 'undefined' && navigator.onLine !== false) ready.add('web')

  return { ready: (id) => ready.has(id), ids: [...ready], desktop }
}

/** One call for the UI: mode, what works offline, and what is worth installing. */
export async function capabilityStatus() {
  const mode = await getCapabilityMode()
  const { ready, desktop } = await probeReadiness()
  const report = offlineReport({ ready, desktop })
  return {
    mode, report, desktop,
    downloads: missingDownloads({ ready, desktop }),
    /** Resolve one capability under the current mode. */
    resolve: (capability, opts = {}) => resolveCapability(capability, { mode, ready, desktop, ...opts }),
  }
}

/**
 * The system-prompt fragment for the active mode.
 *
 * Returns '' in auto mode, so the common path costs nothing — and the whole
 * probe is skipped there rather than paying for a report nobody reads.
 */
export async function capabilityPromptBlock() {
  try {
    const mode = await getCapabilityMode()
    if (mode === MODE.AUTO) return ''
    const { ready, desktop } = await probeReadiness()
    return capabilityBlock(mode, offlineReport({ ready, desktop }))
  } catch { return '' }
}

export { MODE }
