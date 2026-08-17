/**
 * One-time, size-labelled consent gate for large on-device model downloads
 * (VLM ~230MB, embeddings ~23MB, WebLLM ~350MB, Kokoro ~90MB). Prevents a
 * simple action (attaching an image, enabling semantic search) from silently
 * pulling tens/hundreds of MB on a metered connection.
 *
 * Decoupled from React: the gate calls a pluggable prompter so it is testable
 * and the UI layer decides how to ask (App wires a modal via setConsentPrompter).
 * Once granted, the choice is remembered in localStorage per feature key.
 */

const STORE = 'yogatik.downloadConsent'
const KNOWN_SIZES = {
  localVision: 230,
  semanticSearch: 23,
  localLLM: 350,
  neuralVoice: 90,
  whisper: 145,
}

function read() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} }
}
function write(map) {
  try { localStorage.setItem(STORE, JSON.stringify(map)) } catch { /* private mode */ }
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
}
export function revokeConsent(feature) {
  const m = read(); delete m[feature]; write(m)
}

/**
 * Ensure consent for a large download. Returns true if already granted or the
 * user accepts now; false if declined. `sizeMb` overrides the known estimate.
 */
export async function ensureDownloadConsent(feature, { label, sizeMb } = {}) {
  if (hasConsent(feature)) return true
  const mb = sizeMb ?? KNOWN_SIZES[feature]
  const name = label || feature
  const size = mb ? ` (~${mb}MB)` : ''
  const ok = await _prompter(
    `${name} needs a one-time on-device model download${size}. This may use significant data on metered connections. Download now?`,
    { feature, sizeMb: mb, label: name },
  )
  if (ok) grantConsent(feature)
  return !!ok
}

export { KNOWN_SIZES }
