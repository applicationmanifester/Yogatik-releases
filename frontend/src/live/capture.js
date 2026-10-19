/**
 * [live-capture] Live capture quality — torch, digital zoom, sharpest-of-3,
 * battery sampling.
 *
 * The hands-busy user points a phone at a pill label in a dim kitchen and
 * asks. Four of the things that decide whether that works are capture-side,
 * not model-side:
 *
 *  - the TORCH, because a dark frame is unreadable by anyone and `readable.js`
 *    can only refuse on it — the honest refusal is better with an action;
 *  - digital ZOOM, because a pill imprint at arm's length is under ten pixels
 *    wide on the frame the model receives. CSS zoom enlarges only what the
 *    USER sees; this pre-crops the grab canvas so the model and OCR see the
 *    zoomed pixels;
 *  - FOCUS, because a mid-autofocus grab costs the imprint entirely, while
 *    three grabs half a second apart almost always contain one sharp one;
 *  - BATTERY/HEAT sampling — LIVE_ROADMAP §8: "Battery and heat on phones …
 *    Nobody has measured it."
 *
 * Everything pure or honestly-injectable, the same split as devices.js:
 * zoomPlan / laplacianVariance / pickSharpest / batteryBucket are maths over
 * numbers and run in node; torchSupported / setTorch / sharpestFrame /
 * sampleBattery take the platform object as an argument and say "unsupported"
 * rather than pretending.
 */

import { loadImageData } from '../vision/imageStats'
import { TOO_DARK_MEAN } from '../vision/readable'

// ── Digital zoom (the pre-crop the model actually sees) ─────────────────────

export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
/**
 * No grabbed crop narrower than this, on either edge. The grab encoder never
 * upscales (video.js computes `scale = min(1, …)`), so a smaller slice would
 * be SENT tiny — and a 180px-tall crop of a 720p feed cannot be read by OCR
 * no matter how big the user's preview looks.
 */
export const MIN_CROP_EDGE = 240

let zoom = ZOOM_MIN

export function getCaptureZoom() { return zoom }

/** Set the zoom every grab() downstream encodes. Clamped here, once. */
export function setCaptureZoom(z) { zoom = clampZoom(z); return zoom }

/** Zoom belongs to the camera; the camera leaving is a reset, not a memory. */
export function resetCaptureZoom() { zoom = ZOOM_MIN }

/** Coerce to the supported range; anything unusable means "no zoom". */
export function clampZoom(z) {
  const n = Number(z)
  if (!Number.isFinite(n)) return ZOOM_MIN
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n))
}

/**
 * Pure grab-source rect for a zoom level and the capture profile's crop.
 *
 * Both crop (from captureProfile) and zoom are CENTRE fractions of the frame,
 * so they stack multiplicatively: "the middle 60% of a 2x zoom" keeps 30%.
 * The edge guard only ever LOWERS the zoom — a 720p feed cannot take 4x
 * (720/240 = 3), but zoom 1 with the text profile's 0.6 crop reproduces
 * today's rect exactly, so a zoomed capture can never invalidate an existing
 * capture profile.
 *
 * @param {{width?:number, height?:number}} baseDims  the live video's dims
 * @param {number} request  wanted zoom, 1..4 (clamped)
 * @param {number} [crop]   profile centre-crop fraction (0 = full frame)
 * @returns {{ sx:number, sy:number, sw:number, sh:number, zoom:number }}
 */
export function zoomPlan(dims = {}, request = ZOOM_MIN, crop = 0) {
  const { width, height } = dims || {}
  const w = Math.max(0, Math.floor(Number(width) || 0))
  const h = Math.max(0, Math.floor(Number(height) || 0))
  if (!w || !h) return { sx: 0, sy: 0, sw: 0, sh: 0, zoom: ZOOM_MIN }
  const keepCrop = crop > 0 && crop < 1 ? crop : 1
  // The most zoom both edges survive at MIN_CROP_EDGE after the profile crop.
  const maxByEdges = Math.min(w * keepCrop, h * keepCrop) / MIN_CROP_EDGE
  const useZoom = Math.max(ZOOM_MIN, Math.min(clampZoom(request), maxByEdges))
  const keep = keepCrop / useZoom
  const sw = Math.min(w, Math.round(w * keep))
  const sh = Math.min(h, Math.round(h * keep))
  return {
    sx: Math.round((w - sw) / 2),
    sy: Math.round((h - sh) / 2),
    sw,
    sh,
    zoom: useZoom,
  }
}

// ── Torch (honest about being unsupported) ───────────────────────────────────

/**
 * Does THIS track have a controllable torch?
 *
 * getCapabilities() is the only honest source. `applyConstraints` with an
 * `advanced` (best-effort) constraint is NOT guaranteed to reject on hardware
 * that lacks the feature — going by a thrown error on success-sometimes
 * hardware would produce a button that lies. Screen-share tracks and most
 * webcams report no `torch`, and a track without getCapabilities at all is
 * unsupported too.
 */
export function torchSupported(track) {
  if (!track || typeof track.getCapabilities !== 'function') return false
  try {
    return track.getCapabilities()?.torch === true
  } catch {
    return false
  }
}

/**
 * Turn the torch on or off via the MediaTrack torch constraint. Returns a
 * typed result rather than throwing, so the button can speak an honest
 * reason every time — including "the hardware refused despite advertising
 * support", which is exactly the case applyConstraints exists to report.
 *
 * @returns {Promise<{ok: boolean, reason: ?string}>}
 */
export async function setTorch(track, on = false) {
  if (!torchSupported(track)) return { ok: false, reason: 'The camera has no controllable torch' }
  try {
    await track.applyConstraints({ advanced: [{ torch: !!on }] })
    return { ok: true, reason: null }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) }
  }
}

// ── Sharpest-of-3 (focus, for the describe/OCR path) ────────────────────────

/**
 * Normalised Laplacian variance — the classic cheap focus score.
 *
 * A sharp frame has crisp transitions: the Laplacian response is large AND
 * non-uniform, so its variance is big. Blur smooths the response toward flat
 * (variance → 0), which is exactly the one-bit difference the describe path
 * needs: has the autofocus settled or not.
 *
 * Pure over an RGBA array. Stride-sampled like imageStats.edgeDensity so a
 * full-size decode cannot turn into a 12M-iteration pass.
 */
export function laplacianVariance(rgba = null, width = 0, height = 0) {
  const w = Math.floor(Number(width) || 0)
  const h = Math.floor(Number(height) || 0)
  if (w < 3 || h < 3 || !rgba || rgba.length < w * h * 4) return 0
  const step = Math.max(1, Math.floor(Math.min(w, h) / 240))
  const at = (x, y) => {
    const i = (y * w + x) * 4
    return (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000
  }
  const rows = Math.ceil((h - 2) / step)
  const cols = Math.ceil((w - 2) / step)
  const lap = new Float64Array(cols * rows)
  let k = 0
  let sum = 0
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const c = at(x, y)
      const l = 4 * c - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1)
      lap[k++] = l
      sum += l
    }
  }
  const n = k
  if (!n) return 0
  const mean = sum / n
  let acc = 0
  for (let i = 0; i < n; i++) {
    const d = lap[i] - mean
    acc += d * d
  }
  return acc / n
}

/**
 * Pick the highest-scoring frame. Ties and unscorable frames lose to the
 * EARLIER winner ("sharpest" is a metric decision; when nothing can be
 * scored, the first grab stands and we do not pretend otherwise).
 */
export function pickSharpest(candidates = []) {
  let best = null
  let bestScore = -Infinity
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c || c.frame == null) continue
    const s = Number.isFinite(c.score) ? c.score : -Infinity
    // `!best` keeps the FIRST candidate standing when nothing can be scored —
    // "no verdict" may not delete the frame, it may only fail to change the pick.
    if (!best || s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

/**
 * Grab a few frames half a second apart and return the sharpest.
 *
 * 350ms is the re-focus slack of a typical phone after a hand moves; the
 * gaps matter more than their exact length, and the pick follows the metric,
 * not the clock. `decode` and `wait` are injectable so the pure decision is
 * testable without a browser (decode comes back null in node and the call
 * then honestly falls back to the first frame).
 *
 * @param {() => ?string} grab  force-grab from the shared source (video.js)
 * @returns {Promise<{frame: string, scores: ?number[], picked: number, wanted: number, got: number}|null>}
 */
export async function sharpestFrame(grab, {
  count = 3,
  gapMs = 350,
  decode = null,
  wait = (ms) => new Promise(r => setTimeout(r, ms)),
} = {}) {
  const wanted = Math.max(1, Math.min(5, Math.floor(Number(count) || 3)))
  const g = typeof grab === 'function' ? grab : () => null
  const frames = []
  for (let i = 0; i < wanted; i++) {
    if (i > 0 && gapMs > 0) {
      try { await wait(gapMs) } catch { /* a cancelled wait just means "grab now" */ }
    }
    let f = null
    try { f = g(i) } catch { /* a failed grab is skipped, not fatal */ }
    if (f) frames.push(f)
  }
  if (!frames.length) return null

  const decodeFrame = decode || ((src) => loadImageData(src, 320))
  const candidates = []
  for (let i = 0; i < frames.length; i++) {
    let score = null
    try {
      const img = await decodeFrame(frames[i], i)
      if (img?.rgba && img.width >= 3 && img.height >= 3) {
        score = laplacianVariance(img.rgba, img.width, img.height)
      }
    } catch { /* an undecodable frame simply falls out of the scoring */ }
    candidates.push({ frame: frames[i], index: i, score: Number.isFinite(score) ? score : null })
  }
  const best = pickSharpest(candidates.map(c => ({
    ...c,
    score: Number.isFinite(c.score) ? c.score : -Infinity,
  })))
  return {
    frame: best.frame,
    scores: candidates.map(c => (Number.isFinite(c.score) ? c.score : null)),
    picked: best.index,
    wanted,
    got: frames.length,
  }
}

// ── Low-light hint (torch-aware upgrade of the dark refusal) ────────────────

/**
 * The dark conditions readable.js flags, evaluated on the analysis numbers —
 * accepting BOTH key shapes readable.js accepts (nested `luma` and the flat
 * `meanLuma`/`darkFraction` its docstring warns about).
 */
export function isDarkAnalysis(a = {}) {
  const mean = Number.isFinite(a?.luma?.mean) ? a.luma.mean : a?.meanLuma
  const dark = Number.isFinite(a?.luma?.dark) ? a.luma.dark : a?.darkFraction
  if (!Number.isFinite(mean)) return false
  return mean < TOO_DARK_MEAN || (Number.isFinite(dark) && dark > 0.8)
}

/**
 * When readable.js calls the frame dark AND the torch is available, the
 * honest refusal upgrades from a shrug into an action. Null (and the usual
 * refusal) when the torch cannot help.
 */
export function lowLightHint(analysis, { torchSupported = false } = {}) {
  if (!torchSupported || !isDarkAnalysis(analysis)) return null
  return 'Too dark — tap the torch'
}

// ── Battery sampling (LIVE_ROADMAP §8's unmeasured risk) ────────────────────

/**
 * navigator.getBattery() guarded. Firefox and Safari removed the API (it was
 * fingerprinting-adjacent), insecure origins have nothing to sample, and the
 * manager's fields are not guaranteed before the promise resolves — so this
 * gives `{ level: 0..1, charging }` or null and never throws.
 *
 * @param {Navigator} [nav]  injectable for tests
 */
export async function sampleBattery(nav = (typeof navigator !== 'undefined' ? navigator : undefined)) {
  try {
    if (typeof nav?.getBattery !== 'function') return null
    const bat = await nav.getBattery()
    const level = Number(bat?.level)
    if (!Number.isFinite(level)) return null
    return { level: Math.min(1, Math.max(0, level)), charging: bat.charging === true }
  } catch {
    return null
  }
}

/**
 * Coarse 10% battery bucket: 0 = 0–9%, …, 9 = 90–99%, 10 = 100%.
 * Unknown (-1) is recorded NOWHERE — a missing reading must not look like a
 * reading. Coarse on purpose, same terms as everything else in metrics.js.
 */
export function batteryBucket(level) {
  // null/undefined are explicitly unknown — not 0%
  if (level == null) return -1
  const n = Number(level)
  if (!Number.isFinite(n)) return -1
  return Math.min(10, Math.max(0, Math.floor(n * 10)))
}
