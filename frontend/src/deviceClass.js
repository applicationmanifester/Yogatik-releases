/*
 * deviceClass.js — device-class responsive + adaptive UI core.
 *
 * Classifies THIS window into one of five physical device classes —
 * tv | mobile | tablet | laptop | desktop — and publishes it as a
 * `data-device` attribute on <html>, alongside a `data-density` attribute
 * (touch | coarse | normal) that describes the pointer the user actually
 * has. The stylesheet pair `styles/15-device-adaptive.css` keys off those
 * two attributes, so a single attribute write re-themes the whole app for
 * the room the browser is sitting in: a living-room TV, a hand, a lap,
 * or a desk.
 *
 * Why attributes instead of media queries alone:
 * - a 1920px TV and a 1920px desktop monitor are the SAME viewport but
 *   require wildly different UI (10-foot spotlight nav vs. dense utility);
 * - UA detection (SmartTV / Tizen / webOS / AndroidTV) knows that before
 *   any layout maths does;
 * - touch density (44px targets) is a pointer truth, not a width truth —
 *   a narrow desktop window should NOT grow 44px targets.
 *
 * The file is split deliberately: EVERYTHING above the "DOM WIRING" banner
 * is pure and testable without a DOM (see deviceClass.test.js); the DOM
 * layer (attribute writes, safe-area probing, viewport-meta fix, debounced
 * re-evaluation on resize/orientationchange) is thin and every function is
 * exported so tests can drive it piece by piece.
 */

/* ────────────────────────── PURE CORE (no DOM) ────────────────────────── */

// Breakpoints, in CSS px. Width brackets match the app's own media queries
// (04-mobile-responsive-adjustments/css + mobile-optimizations.css collapse
// the shell at ~768-820px), so `data-device` and the CSS agree about where
// phones end even when JS drives the attribute.
export const MOBILE_MAX_PX = 820   // ≤ 820 (or coarse pointer) → mobile
export const TABLET_MAX_PX = 1279  // 821–1279 → tablet
export const LAPTOP_MAX_PX = 1919  // 1280–1919 → laptop
export const DESKTOP_MIN_PX = 1920 // ≥ 1920 → desktop

// A device may claim the TV class by SIZE only when BOTH viewport axes are
// large AND the pointer is coarse — i.e. the min(100vw, 100vh) measurement
// (whichever axis is smaller) is at least this. 1600px guaranteed a metre+
// diagonal long before 4K was common; a 1920×1080 touch kiosk (min 1080)
// still does not qualify.
export const TV_MIN_VIEWPORT_PX = 1600

export const DEVICE_CLASSES = ['tv', 'mobile', 'tablet', 'laptop', 'desktop']
export const DENSITIES = ['touch', 'coarse', 'normal']

export const DEBOUNCE_MS = 150

// TV-class User-Agent families, by platform. Browsers on TV surfaces report
// themselves in the UA string — this is the cheapest and most reliable of
// the two detection paths and is evaluated before any size maths.
//
//  - token `TV` (Smart-TV, SMART-TV, HbbTV, "TV" in BRAVIA strings, …)
//  - Tizen (Samsung), webOS/Web0S (LG), AndroidTV ("Android TV" builds)
//  - synonyms kept because TV UA strings are inconsistent: BRAVIA, Netcast
//    (LG), Viera (Panasonic), AppleTV, Fire TV (`AFTS`/`AFTMM` model codes),
//    GoogleTV.
//
// Deliberately NEGATIVE for: desktop Chrome/Firefox/Safari, iOS "Mobile
// Safari", stock Android phones (none of the tokens appear there; a phone
// that lies in its UA could only get the size+coarse path below).
const TV_TOKEN_RE = /\b(smart[- _]?tv|tizen|web0s|webos|hbbtv|bravia|netcast|viera|android[- _]?tv|google[- _]?tv|fire-?tv|aft[a-z])\b|\btv\b|appletv/i

export function isTvUserAgent(ua) {
  if (!ua) return false
  return TV_TOKEN_RE.test(String(ua))
}

/**
 * Classify from already-measured primitives. Pure; exported for tests.
 * Evaluation order matters and mirrors the CSS confidence ladder:
 *   1. UA says TV              → 'tv'      (a UA statement beats geometry)
 *   2. huge viewport + coarse  → 'tv'      (min(100vw,vh) ≥ 1600 && coarse)
 *   2b. zero×zero measurement  → 'desktop' (nothing known: no small-screen guess)
 *   3. narrow window OR coarse → 'mobile'  (spec: ≤820px OR coarse pointer)
 *   4. 821–1279                → 'tablet'
 *   5. 1280–1919               → 'laptop'
 *   6. ≥ 1920                  → 'desktop'
 *
 * Note (spec-literal, test-pinned): a desktop-size window that merely
 * happens to have a coarse primary pointer (touchscreen laptops, kiosks)
 * still classifies as 'mobile', because `data-density` already expresses
 * the touch story for the CSS layer; `data-device` should not disagree
 * about the same fact twice.
 *
 * @param {{ ua?: string, viewportWidth?: number, viewportHeight?: number, coarsePointer?: boolean }} m
 * @returns {'tv'|'mobile'|'tablet'|'laptop'|'desktop'}
 */
export function classifyDevice({ ua = '', viewportWidth = 0, viewportHeight = 0, coarsePointer = false } = {}) {
  if (isTvUserAgent(ua)) return 'tv'
  const minAxis = Math.min(viewportWidth, viewportHeight)
  if (minAxis >= TV_MIN_VIEWPORT_PX && coarsePointer) return 'tv'
  // No measurement at all (window absent / read failed): refuse to guess
  // small — the app's primary surface is desk-class, and a REAL phone
  // window always reports an actual width through describeDevice().
  if (!viewportWidth && !viewportHeight) return 'desktop'
  if (viewportWidth <= MOBILE_MAX_PX) return 'mobile'
  if (coarsePointer) return 'mobile'
  if (viewportWidth <= TABLET_MAX_PX) return 'tablet'
  if (viewportWidth <= LAPTOP_MAX_PX) return 'laptop'
  return 'desktop'
}

/**
 * Pointer story for the CSS layer:
 *  - 'touch'   — coarse pointer on a small/personal surface (phone, tablet)
 *  - 'coarse'  — coarse pointer on a large surface (TV kiosk, touch
 *                desktop) — everything gets big without the
 *                phone-shaped bottom sheets
 *  - 'normal'  — fine pointer (mouse/trackpad), 13-14px utility text fine
 *
 * @param {{ deviceClass: string, coarsePointer?: boolean }} m
 * @returns {'touch'|'coarse'|'normal'}
 */
export function densityFor({ deviceClass, coarsePointer = false } = {}) {
  if (!coarsePointer) return 'normal'
  if (deviceClass === 'mobile' || deviceClass === 'tablet') return 'touch'
  return 'coarse'
}

/* Safe-area var names exposed on <html> by injectSafeAreaVars(). Named
 * --sat/--sab/--sal/--sar so the CSS layer can use them tersely; readers
 * should still fall back to env() themselves (var(--sab, env(..., 0px)))
 * because this module runs after first styles resolve. */
export const SAFE_AREA_VARS = {
  top: '--sat',
  bottom: '--sab',
  left: '--sal',
  right: '--sar',
}
const SAFE_SIDES = ['top', 'right', 'bottom', 'left']

// The canonical viewport content that iOS input-focus jitter needs:
//   interactive-widget=resizes-content — Chrome Android: the keyboard
//     resizes the page rather than overlaying it, so our safe-area +
//     keyboard-height layout maths stay truthful
//   viewport-fit=cover — lets env(safe-area-inset-*) report NOTCH insets
//     on iOS; without it Safari zeroes the insets and the composer
//     slides under the home bar
//   width=device-width, initial-scale=1.0 — the zero-jitter baseline
// maximum-scale / user-scalable are deliberately NOT emitted, and are
// stripped when present: honouring user zoom is non-negotiable (WCAG
// 1.4.4), and iOS ignores zoom suppression anyway — a lingering
// maximum-scale only adds confusion.
const CANONICAL_VIEWPORT = {
  width: 'device-width',
  'initial-scale': '1.0',
  'viewport-fit': 'cover',
  'interactive-widget': 'resizes-content',
}

/** Parse a viewport meta content string → Map of key→value (order kept). */
function parseViewport(content) {
  const pairs = new Map()
  for (const part of String(content || '').split(/\s*,\s*/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) pairs.set(trimmed.toLowerCase(), '')
    else pairs.set(trimmed.slice(0, eq).trim().toLowerCase(), trimmed.slice(eq + 1).trim())
  }
  return pairs
}

/**
 * Merge the canonical fix into an EXISTING viewport content string.
 *
 * - canonical keys win; everything already set that is not in the
 *   canonical list is preserved verbatim (order included),
 * - zoom-suppressing keys (`maximum-scale`, `minimum-scale`, `user-scalable`)
 *   are REMOVED, never re-added: zoom stays in the user's hands,
 * - an implicit `user-scalable=no` is therefore also gone; there is no
 *   way through this helper to ship a viewport that forbids zooming.
 *
 * Pure; exported for tests. Returns the content string to write back.
 */
export function getViewportMetaFix(existing = '') {
  const pairs = parseViewport(existing)
  for (const zoomKey of ['maximum-scale', 'minimum-scale', 'user-scalable']) pairs.delete(zoomKey)
  for (const [key, value] of Object.entries(CANONICAL_VIEWPORT)) pairs.set(key, value)
  return [...pairs.entries()]
    .map(([key, value]) => (value ? `${key}=${value}` : key))
    .join(', ')
}

/* ───────────────────────────── DOM WIRING ───────────────────────────── */

function defaultWindow() {
  return typeof window !== 'undefined' ? window : undefined
}

function viewOf(doc) {
  return doc?.defaultView ?? defaultWindow()
}

// Is the primary pointer coarse (finger / stylus / remote)? matchMedia is
// the truth; maxTouchPoints is the fallback for environments without it.
function detectCoarsePointer(view) {
  try {
    const mq = view?.matchMedia?.('(pointer: coarse)')
    if (mq) return mq.matches === true
  } catch { /* fall through to touch points */ }
  try {
    return (view?.navigator?.maxTouchPoints ?? 0) > 0
  } catch {
    return false
  }
}

export function pxString(n) {
  const clamped = Math.max(0, Math.round(n * 100) / 100)
  return `${clamped}px`
}

/** Pull the px count out of a computed `padding-*` value. Pure. */
export function parseSafeAreaPx(raw) {
  const m = /(-?\d+(?:\.\d+)?)\s*px/i.exec(String(raw ?? ''))
  const n = m ? parseFloat(m[1]) : NaN
  return Number.isFinite(n) ? n : 0
}

/**
 * Measure THIS environment (viewport, UA, pointer) and classify. Pure
 * apart from reading the three inputs; everything else in here funnels
 * into classifyDevice().
 */
export function describeDevice(view = defaultWindow(), ua) {
  if (!view) {
    // No window (worker / unit-test harness without jsdom): refuse to
    // guess — classifyDevice defaults a zero measurement to desktop, and
    // attributes are simply never applied from here.
    return { deviceClass: classifyDevice({}), density: 'normal', viewportWidth: 0, viewportHeight: 0, coarsePointer: false }
  }
  const viewportWidth = view.innerWidth ?? 0
  const viewportHeight = view.innerHeight ?? 0
  const coarsePointer = detectCoarsePointer(view)
  const resolvedUa = ua ?? view.navigator?.userAgent ?? ''
  const deviceClass = classifyDevice({
    ua: resolvedUa,
    viewportWidth,
    viewportHeight,
    coarsePointer,
  })
  return {
    deviceClass,
    density: densityFor({ deviceClass, coarsePointer }),
    viewportWidth,
    viewportHeight,
    coarsePointer,
  }
}

/**
 * Write `data-device` + `data-density` onto documentElement. Idempotent.
 * Returns the measurement that was applied.
 */
export function applyDeviceAttributes(doc = (typeof document !== 'undefined' ? document : undefined), measured) {
  if (!doc) return null
  const result = measured ?? describeDevice(viewOf(doc))
  doc.documentElement.setAttribute('data-device', result.deviceClass)
  doc.documentElement.setAttribute('data-density', result.density)
  return result
}

/** Current inline values of the four safe-area vars, for tests/diagnostics. */
export function readSafeAreaVars(doc = document) {
  const out = {}
  if (!doc) return out
  for (const side of SAFE_SIDES) {
    const name = SAFE_AREA_VARS[side]
    out[side] = doc.documentElement.style.getPropertyValue(name) || null
  }
  return out
}

/**
 * env() cannot be READ from JS directly — CSS evaluates it. So: a one-off
 * invisible probe div carries `padding-*: env(safe-area-inset-*, 0px)`,
 * its computed paddings ARE the insets, and we mirror them onto <html> as
 * --sat/--sab/--sal/--sar CSS variables. Only variables that are MISSING
 * get written, so anything a stylesheet (or a prior run) has already
 * declared keeps authority.
 */
export function injectSafeAreaVars(doc = (typeof document !== 'undefined' ? document : undefined)) {
  const rootEl = doc?.documentElement
  const view = viewOf(doc)
  if (!rootEl || !view) return null

  const current = readSafeAreaVars(doc)
  const missing = SAFE_SIDES.filter(side => !current[side])
  if (!missing.length) return current

  let probed = null
  try {
    const probe = doc.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'border:0',
      'padding-top:env(safe-area-inset-top, 0px)',
      'padding-right:env(safe-area-inset-right, 0px)',
      'padding-bottom:env(safe-area-inset-bottom, 0px)',
      'padding-left:env(safe-area-inset-left, 0px)',
    ].join(';')
    ;(doc.body || rootEl).appendChild(probe)
    const cs = view.getComputedStyle(probe)
    probed = {}
    for (const side of SAFE_SIDES) {
      probed[side] = pxString(parseSafeAreaPx(cs ? cs.getPropertyValue(`padding-${side}`) : ''))
    }
    probe.remove()
  } catch {
    probed = null // fallen through to 0px defaults below
  }

  for (const side of missing) {
    const value = probed?.[side] || '0px'
    rootEl.style.setProperty(SAFE_AREA_VARS[side], value)
    current[side] = value
  }
  return current
}

/**
 * Point the real viewport meta tag at the canonical content (iOS input
 * focus / Android keyboard resize / notch insets / user zoom). Creating a
 * meta tag mid-document is NOT done here — index.html ships exactly one
 * viewport meta and every surface shares it.
 */
export function fixViewportMeta(doc = (typeof document !== 'undefined' ? document : undefined)) {
  const meta = doc?.querySelector?.('meta[name="viewport"]')
  if (!meta) return null
  const before = meta.getAttribute('content') || ''
  const after = getViewportMetaFix(before)
  if (after !== before) meta.setAttribute('content', after)
  return after
}

function debounce(fn, ms) {
  let timer = null
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return wrapped
}

/**
 * Install everything once:
 *   1. measure + write data-device / data-density,
 *   2. probe + publish --sat/--sab/--sal/--sar if missing,
 *   3. repair the viewport meta (never adding zoom suppression),
 *   4. re-evaluate 1+2 (and 3) on resize / orientationchange, debounced.
 *
 * Returns a small controller — the `dispose()` return in App.jsx's mount
 * effect is what keeps StrictMode/HMR double-mounts from stacking
 * listeners. Never throws: a broken probe degrades to 0px, not to a
 * white screen.
 */
export function initDeviceClass({ doc = (typeof document !== 'undefined' ? document : undefined), onApply } = {}) {
  if (!doc) return { result: null, reapply: () => null, dispose: () => {} }

  const apply = () => {
    try {
      const result = applyDeviceAttributes(doc)
      injectSafeAreaVars(doc)
      fixViewportMeta(doc)
      onApply?.(result)
      return result
    } catch (err) {
      // Attribute/probe failures must never take the app's first paint down.
      console.warn('[deviceClass] adapt pass failed (continuing):', err?.message || err)
      return null
    }
  }

  const first = apply()
  const debouncedApply = debounce(apply, DEBOUNCE_MS)
  const view = viewOf(doc)

  // Both rotation sources collapse into one debounced re-evaluation.
  const onResize = () => debouncedApply()

  view?.addEventListener?.('resize', onResize, { passive: true })
  view?.addEventListener?.('orientationchange', onResize, { passive: true })

  return {
    result: first,
    reapply: apply,
    dispose() {
      debouncedApply.cancel()
      view?.removeEventListener?.('resize', onResize)
      view?.removeEventListener?.('orientationchange', onResize)
    },
  }
}
