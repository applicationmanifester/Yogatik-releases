/**
 * One-time, size-labelled consent gate for large on-device model downloads.
 * Every large download is a BLOCKING, size-labelled decision — never silent:
 *
 *   VLM / object detection  ~40MB   (DETR overlay, one-shot describe fallback)
 *   Embeddings              ~23MB   (MiniLM semantic re-rank; full local RAG
 *                                    corpus with vectors can reach ~230MB)
 *   WebLLM on-device chat   ~350MB  (quantised instruct model + runtime)
 *   Kokoro narrator         ~90MB   (video narration voice)
 *   Whisper STT             ~145MB  (on-device transcription)
 *   Local VLM describe      ~230MB  (SmolVLM captioning fallback)
 *
 * Decoupled from React: the gate calls a pluggable prompter so it is testable
 * and the UI layer decides how to ask (App wires a modal via setConsentPrompter).
 * Once granted, the choice is remembered in localStorage per feature key, and
 * mirrored into the features.* toggle store so Settings shows one truth.
 */

const STORE = 'yogatik.downloadConsent'

/** Canonical per-feature download sizes (MB). Single source of truth. */
const KNOWN_SIZES = {
  localVision: 230,      // SmolVLM describe fallback
  objectDetection: 40,   // DETR overlay / VLM detection
  semanticSearch: 23,    // MiniLM embeddings (corpus with vectors up to ~230MB)
  localLLM: 350,         // WebLLM quantised chat model
  neuralVoice: 90,       // Kokoro-82M narrator
  whisper: 145,          // Whisper-base STT
}

/** Human labels used in the blocking prompt. */
const FEATURE_LABELS = {
  localVision: 'On-device vision',
  objectDetection: 'Object detection',
  semanticSearch: 'Semantic search',
  localLLM: 'On-device chat model',
  neuralVoice: 'Neural voice',
  whisper: 'On-device speech recognition',
}

/**
 * Feature-toggle keys in features.js that imply the same consent. Granting
 * consent flips the toggle on; the toggle is the Settings-visible memory.
 * (Imported lazily to avoid a require cycle: features.js never imports here.)
 */
const FEATURE_TOGGLE_FOR = {
  localVision: 'localVision',
  objectDetection: 'liveObjectDetection',
  semanticSearch: 'semanticSearch',
}

function read() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} }
}
function write(map) {
  try { localStorage.setItem(STORE, JSON.stringify(map)) } catch { /* private mode */ }
}

/** Size line for a feature, including the embeddings range note. */
export function sizeLabel(feature, sizeMb) {
  const mb = sizeMb ?? KNOWN_SIZES[feature]
  if (mb == null) return ''
  if (feature === 'semanticSearch') return ' (~23MB, up to ~230MB with a large indexed corpus)'
  return ` (~${mb}MB)`
}

/** Blocking, size-labelled prompt text: "Download N MB?" — never silent. */
export function consentMessage(feature, { label, sizeMb } = {}) {
  const name = label || FEATURE_LABELS[feature] || feature
  return `${name} needs a one-time on-device model download${sizeLabel(feature, sizeMb)}. ` +
    `This may use significant data on metered connections. Download ${sizeMb ?? KNOWN_SIZES[feature] ?? ''} MB now?`
}

/** Default prompter: browser confirm(). App overrides with a themed modal. */
let _prompter = async (message) => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(message)
}
export function setConsentPrompter(fn) { if (typeof fn === 'function') _prompter = fn }

export function hasConsent(feature) {
  return read()[feature] === true
}
export function grantConsent(feature) {
  write({ ...read(), [feature]: true })
  mirrorConsentToFeatures(feature)
}
export function revokeConsent(feature) {
  const m = read(); delete m[feature]; write(m)
}

/**
 * Mirror a granted consent into the features toggle store (localStorage
 * `yogatik.features`) so Settings shows one truth: consent === toggle on.
 * Best-effort; never throws, never overwrites an explicit user opt-out of
 * an unrelated toggle.
 */
export function mirrorConsentToFeatures(feature) {
  try {
    const toggle = FEATURE_TOGGLE_FOR[feature]
    if (!toggle) return
    const KEY = 'yogatik.features'
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (stored[toggle] !== true) {
      localStorage.setItem(KEY, JSON.stringify({ ...stored, [toggle]: true }))
    }
  } catch { /* private mode */ }
}

/**
 * Ensure consent for a large download. Returns true if already granted or the
 * user accepts now; false if declined. `sizeMb` overrides the known estimate.
 * The prompt is BLOCKING (awaited) and always size-labelled per feature.
 */
export async function ensureDownloadConsent(feature, { label, sizeMb } = {}) {
  if (hasConsent(feature)) return true
  const mb = sizeMb ?? KNOWN_SIZES[feature]
  const name = label || FEATURE_LABELS[feature] || feature
  const ok = await _prompter(consentMessage(feature, { label: name, sizeMb: mb }), {
    feature, sizeMb: mb, label: name, blocking: true,
  })
  if (ok) grantConsent(feature)
  return !!ok
}

export { KNOWN_SIZES, FEATURE_LABELS }
