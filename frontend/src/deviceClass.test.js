// deviceClass.test.js — pure unit tests for the device-class core.
//
// Everything under "PURE CORE" in deviceClass.js is tested without DOM
// entanglement: breakpoint brackets, TV UA detection, density mapping and
// viewport-meta merging. The DOM glue (attribute writes, safe-area probe,
// listener lifecycle) gets a jsdom-level test each, but stays deliberately
// shallow — the classifier is where regressions hurt five devices at once.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEBOUNCE_MS,
  MOBILE_MAX_PX,
  TABLET_MAX_PX,
  LAPTOP_MAX_PX,
  DESKTOP_MIN_PX,
  TV_MIN_VIEWPORT_PX,
  SAFE_AREA_VARS,
  isTvUserAgent,
  classifyDevice,
  densityFor,
  getViewportMetaFix,
  describeDevice,
  applyDeviceAttributes,
  injectSafeAreaVars,
  readSafeAreaVars,
  parseSafeAreaPx,
  pxString,
  fixViewportMeta,
  initDeviceClass,
} from './deviceClass'

/* ─────────────── helpers (jsdom window measurement stubs) ─────────────── */

// Real, complete UA strings kept in one place for both the pure tests and
// the jsdom-level attribute tests.
const TIZEN_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 89.0.4389.2/6.5 TV Safari/537.36'
const WEBOS_UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0 Safari/537.36 WebAppManager'

function setWindowViewport({ width, height, coarse }) {
  if (width !== undefined) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  }
  if (height !== undefined) {
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
  }
  if (coarse !== undefined) {
    Object.defineProperty(window, 'matchMedia', {
      value: (q) => ({ matches: !!coarse && /coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {} }),
      configurable: true,
      writable: true,
    })
  }
}

let savedViewport
beforeEach(() => {
  savedViewport = {
    w: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
    h: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
    mm: Object.getOwnPropertyDescriptor(window, 'matchMedia'),
  }
})
afterEach(() => {
  if (savedViewport.w) Object.defineProperty(window, 'innerWidth', savedViewport.w)
  if (savedViewport.h) Object.defineProperty(window, 'innerHeight', savedViewport.h)
  if (savedViewport.mm) Object.defineProperty(window, 'matchMedia', savedViewport.mm)
  document.documentElement.removeAttribute('data-device')
  document.documentElement.removeAttribute('data-density')
  for (const name of Object.values(SAFE_AREA_VARS)) {
    document.documentElement.style.removeProperty(name)
  }
  document.querySelector('meta[name="viewport"]')?.remove()
  vi.useRealTimers()
})

/* ─────────────────────────── TV detection ─────────────────────────── */

describe('isTvUserAgent', () => {
  it('detects the TV/SmartTV/Tizen/webOS/AndroidTV families from real UA strings', () => {
    const tvUas = [
      'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 89.0.4389.2/6.5 TV Safari/537.36',
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.87 Safari/537.36 WebAppManager',
      'Mozilla/5.0 (Linux; ARM; Android 11; AndroidTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 TV Safari/537.36',
      'Mozilla/5.0 (Linux; Android 7.0; BRAVIA 4K GB Build/NRD91N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Safari/537.36',
    ]
    for (const ua of tvUas) expect(isTvUserAgent(ua)).toBe(true)
  })

  it('flags the common TV synonyms (Google TV, Fire TV model codes, AppleTV, HbbTV)', () => {
    expect(isTvUserAgent('Mozilla/5.0 (Linux; Android 5.1; AFTS Build/LVY48F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0 Safari/537.36 AFT')).toBe(true)
    expect(isTvUserAgent('Mozilla/5.0 (X11; Android TV; GoogleTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36')).toBe(true)
    expect(isTvUserAgent('AppleTV6,2/11.1')).toBe(true)
    expect(isTvUserAgent('HbbTV/1.2.1 (+BD;LKF) Samsung')).toBe(true)
  })

  it('does NOT match desktop browsers, iPhone or ordinary Android phone UAs', () => {
    const notTv = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (compatible; AdSenseBot)', // page-critical: ads bot must stay desktop-class
    ]
    for (const ua of notTv) expect(isTvUserAgent(ua)).toBe(false)
  })

  it('is falsy-safe on empty/absent UA strings', () => {
    expect(isTvUserAgent('')).toBe(false)
    expect(isTvUserAgent(null)).toBe(false)
    expect(isTvUserAgent(undefined)).toBe(false)
  })
})

/* ───────────────────────── breakpoint brackets ───────────────────────── */

describe('classifyDevice breakpoints', () => {
  it('mobile ≤ 820 (spec bracket, fine pointer)', () => {
    expect(MOBILE_MAX_PX).toBe(820)
    expect(classifyDevice({ viewportWidth: 320, viewportHeight: 568 })).toBe('mobile')
    expect(classifyDevice({ viewportWidth: 414, viewportHeight: 896 })).toBe('mobile')
    expect(classifyDevice({ viewportWidth: MOBILE_MAX_PX, viewportHeight: 1200 })).toBe('mobile')
  })

  it('coarse pointer forces mobile even at desktop-class widths (spec: "or coarse pointer")', () => {
    // 1920×1080 all-in-one touchscreen: NOT tv (min axis 1080 < 1600) —
    // spec-literal coarse→mobile mobile, density carries the touch story.
    expect(classifyDevice({ viewportWidth: 1920, viewportHeight: 1080, coarsePointer: true })).toBe('mobile')
    expect(classifyDevice({ viewportWidth: 1400, viewportHeight: 900, coarsePointer: true })).toBe('mobile')
  })

  it('tablet 821–1279', () => {
    expect(TABLET_MAX_PX).toBe(1279)
    expect(classifyDevice({ viewportWidth: MOBILE_MAX_PX + 1, viewportHeight: 1200 })).toBe('tablet')
    expect(classifyDevice({ viewportWidth: 1024, viewportHeight: 768 })).toBe('tablet')
    expect(classifyDevice({ viewportWidth: TABLET_MAX_PX, viewportHeight: 900 })).toBe('tablet')
    // 1280 is the laptop bracket's lower bound, not a tablet width.
    expect(classifyDevice({ viewportWidth: TABLET_MAX_PX + 1, viewportHeight: 900 })).toBe('laptop')
  })

  it('laptop 1280–1919', () => {
    expect(LAPTOP_MAX_PX).toBe(1919)
    expect(classifyDevice({ viewportWidth: 1280, viewportHeight: 720 })).toBe('laptop')
    expect(classifyDevice({ viewportWidth: 1440, viewportHeight: 900 })).toBe('laptop')
    expect(classifyDevice({ viewportWidth: LAPTOP_MAX_PX, viewportHeight: 1080 })).toBe('laptop')
  })

  it('desktop ≥ 1920', () => {
    expect(DESKTOP_MIN_PX).toBe(1920)
    expect(classifyDevice({ viewportWidth: DESKTOP_MIN_PX, viewportHeight: 1080 })).toBe('desktop')
    expect(classifyDevice({ viewportWidth: 3840, viewportHeight: 2160 })).toBe('desktop')
  })

  it('UA-declared TV wins over any size', () => {
    expect(classifyDevice({ ua: TIZEN_UA, viewportWidth: 500, viewportHeight: 500 })).toBe('tv')
    expect(classifyDevice({ ua: WEBOS_UA, viewportWidth: 3840, viewportHeight: 2160, coarsePointer: false })).toBe('tv')
  })

  it('size-claimed TV requires BOTH a ≥1600px min axis and a coarse pointer', () => {
    expect(TV_MIN_VIEWPORT_PX).toBe(1600)
    // 3840×2200 living-room browser with remote (coarse) → tv.
    expect(classifyDevice({ viewportWidth: 3840, viewportHeight: 2200, coarsePointer: true })).toBe('tv')
    // Same size but fine pointer → desktop (a mouse is a desk, not a couch).
    expect(classifyDevice({ viewportWidth: 3840, viewportHeight: 2200, coarsePointer: false })).toBe('desktop')
    // 1920×1080 kiosk → min axis 1080 < 1600 → not tv, coarse → mobile.
    expect(classifyDevice({ viewportWidth: 1920, viewportHeight: 1080, coarsePointer: true })).toBe('mobile')
  })

  it('gracefully classifies the empty measurement object as desktop', () => {
    expect(classifyDevice({})).toBe('desktop')
    expect(classifyDevice()).toBe('desktop')
  })
})

describe('densityFor', () => {
  it('touch for coarse pointers on phones and tablets', () => {
    expect(densityFor({ deviceClass: 'mobile', coarsePointer: true })).toBe('touch')
    expect(densityFor({ deviceClass: 'tablet', coarsePointer: true })).toBe('touch')
  })

  it('coarse for coarse pointers on large surfaces (TV kiosk, touch desktop)', () => {
    expect(densityFor({ deviceClass: 'tv', coarsePointer: true })).toBe('coarse')
    expect(densityFor({ deviceClass: 'desktop', coarsePointer: true })).toBe('coarse')
    expect(densityFor({ deviceClass: 'laptop', coarsePointer: true })).toBe('coarse')
  })

  it('normal for fine pointers regardless of device class', () => {
    for (const deviceClass of ['tv', 'mobile', 'tablet', 'laptop', 'desktop']) {
      expect(densityFor({ deviceClass, coarsePointer: false })).toBe('normal')
    }
  })
})

describe('getViewportMetaFix', () => {
  it('emits the canonical content from scratch (no zoom keys, ever)', () => {
    const out = getViewportMetaFix('')
    expect(out).toContain('width=device-width')
    expect(out).toContain('initial-scale=1.0')
    expect(out).toContain('viewport-fit=cover')
    expect(out).toContain('interactive-widget=resizes-content')
    expect(out).not.toMatch(/maximum-scale/i)
    expect(out).not.toMatch(/user-scalable/i)
  })

  it('leaves the exact index.html content semantically unchanged', () => {
    const existing = 'width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content'
    const out = getViewportMetaFix(existing)
    expect(out).toContain('width=device-width')
    for (const key of ['initial-scale', 'viewport-fit', 'interactive-widget']) expect(out).toContain(key)
    // No duplicate keys slipped in
    expect(out.split('initial-scale').length - 1).toBe(1)
    expect(out.split('interactive-widget').length - 1).toBe(1)
  })

  it('strips zoom suppression (maximum-scale / user-scalable=no) and honors user zoom', () => {
    const out = getViewportMetaFix('width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no')
    expect(out).not.toMatch(/maximum-scale/i)
    expect(out).not.toMatch(/user-scalable/i)
    expect(out).toContain('initial-scale=1.0')
    expect(out).toContain('interactive-widget=resizes-content')
  })

  it('preserves unknown keys from the existing content instead of dropping them', () => {
    const out = getViewportMetaFix('some-future-feature=1, width=device-width')
    expect(out).toContain('some-future-feature=1')
    expect(out).toContain('width=device-width')
  })

  it('canonical values win over existing ones of the same key', () => {
    const out = getViewportMetaFix('width=600, initial-scale=0.5')
    expect(out).toContain('width=device-width')
    expect(out).toContain('initial-scale=1.0')
  })
})

/* ─────────────────── safe-area px parsing (pure) ─────────────────── */

describe('safe area helpers', () => {
  it('parseSafeAreaPx reads computed px values and tolerates junk', () => {
    expect(parseSafeAreaPx('0px')).toBe(0)
    expect(parseSafeAreaPx('47px')).toBe(47)
    expect(parseSafeAreaPx('12.5px')).toBe(12.5)
    expect(parseSafeAreaPx('')).toBe(0)
    expect(parseSafeAreaPx('auto')).toBe(0)
    expect(parseSafeAreaPx(null)).toBe(0)
  })

  it('pxString shapes numbers into CSS lengths', () => {
    expect(pxString(0)).toBe('0px')
    expect(pxString(47)).toBe('47px')
    expect(pxString(-3)).toBe('0px') // insets are never negative
  })
})

/* ───────────────────── DOM glue (jsdom-level) ───────────────────── */

describe('applyDeviceAttributes / describeDevice', () => {
  it('writes data-device + data-density on documentElement (idempotent)', () => {
    setWindowViewport({ width: 1440, height: 900 })
    const result = applyDeviceAttributes(document)
    expect(result.deviceClass).toBe('laptop')
    expect(result.density).toBe('normal')
    expect(document.documentElement.getAttribute('data-device')).toBe('laptop')
    expect(document.documentElement.getAttribute('data-density')).toBe('normal')
    const again = applyDeviceAttributes(document, result)
    expect(again.deviceClass).toBe('laptop')
  })

  it('describes a live jsdom window including coarse-pointer fallback', () => {
    setWindowViewport({ width: 600, height: 900, coarse: true })
    const result = describeDevice(window, '')
    expect(result.deviceClass).toBe('mobile')
    expect(result.density).toBe('touch')
    expect(result.coarsePointer).toBe(true)
  })
})

describe('injectSafeAreaVars', () => {
  it('exposes --sat/--sab/--sal/--sar on documentElement', () => {
    const result = injectSafeAreaVars(document)
    expect(result).not.toBeNull()
    for (const name of Object.values(SAFE_AREA_VARS)) {
      expect(document.documentElement.style.getPropertyValue(name)).toMatch(/^[\d.]+px$/)
    }
  })

  it('fills only the MISSING vars (a pre-set value keeps authority)', () => {
    document.documentElement.style.setProperty('--sat', '47px')
    injectSafeAreaVars(document)
    expect(readSafeAreaVars(document).top).toBe('47px')
    expect(readSafeAreaVars(document).bottom).toMatch(/^[\d.]+px$/)
  })
})

describe('fixViewportMeta', () => {
  it('rewrites the existing meta to the canonical content', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no')
    document.head.appendChild(meta)
    const out = fixViewportMeta(document)
    expect(out).not.toMatch(/maximum-scale/i)
    expect(out).not.toMatch(/user-scalable/i)
    expect(meta.getAttribute('content')).toBe(out)
  })

  it('no-ops when no viewport meta exists (index.html is the only owner)', () => {
    expect(fixViewportMeta(document)).toBeNull()
  })
})

describe('initDeviceClass', () => {
  it('installs attributes + viewport fix + safe-area vars on mount', () => {
    setWindowViewport({ width: 1440, height: 900 })
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1')
    document.head.appendChild(meta)

    const controller = initDeviceClass({ doc: document })
    expect(controller.result.deviceClass).toBe('laptop')
    expect(document.documentElement.getAttribute('data-device')).toBe('laptop')
    expect(meta.getAttribute('content')).not.toMatch(/maximum-scale/i)
    for (const name of Object.values(SAFE_AREA_VARS)) {
      expect(document.documentElement.style.getPropertyValue(name)).toMatch(/^[\d.]+px$/)
    }
    controller.dispose()
  })

  it('re-evaluates debounced on resize (mobile → density touch)', () => {
    setWindowViewport({ width: 1440, height: 900 })
    const controller = initDeviceClass({ doc: document })
    expect(document.documentElement.getAttribute('data-device')).toBe('laptop')

    // The fake clock must be in control BEFORE the debounced timer is
    // scheduled by the listener, not after.
    vi.useFakeTimers()
    setWindowViewport({ width: 500, height: 820, coarse: true })
    window.dispatchEvent(new Event('resize'))
    // Before the debounce elapses nothing has changed.
    expect(document.documentElement.getAttribute('data-device')).toBe('laptop')
    vi.advanceTimersByTime(DEBOUNCE_MS + 10)
    expect(document.documentElement.getAttribute('data-device')).toBe('mobile')
    expect(document.documentElement.getAttribute('data-density')).toBe('touch')
    controller.dispose()
  })

  it('re-evaluates on orientationchange and reports each pass through onApply', () => {
    setWindowViewport({ width: 1440, height: 900 })
    const onApply = vi.fn()
    const controller = initDeviceClass({ doc: document, onApply })
    const initialCalls = onApply.mock.calls.length
    vi.useFakeTimers()
    setWindowViewport({ width: 2560, height: 1440 })
    window.dispatchEvent(new Event('orientationchange'))
    vi.advanceTimersByTime(DEBOUNCE_MS + 10)
    expect(onApply.mock.calls.length).toBeGreaterThan(initialCalls)
    expect(document.documentElement.getAttribute('data-device')).toBe('desktop')
    controller.dispose()
  })

  it('dispose stops further re-evaluation (no stacked listeners across remounts)', () => {
    setWindowViewport({ width: 500, height: 800 })
    const controller = initDeviceClass({ doc: document })
    controller.dispose()

    vi.useFakeTimers()
    setWindowViewport({ width: 2560, height: 1440 })
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(DEBOUNCE_MS + 10)
    expect(document.documentElement.getAttribute('data-device')).toBe('mobile') // frozen at dispose time
  })

  it('never throws without a doc (worker/SSR-style environments)', () => {
    // `doc: null` bypasses the destructuring default (jsdom's document) to
    // exercise the truly doc-less path.
    const controller = initDeviceClass({ doc: null })
    expect(controller.result).toBeNull()
    expect(() => controller.reapply()).not.toThrow()
    expect(() => controller.dispose()).not.toThrow()
  })
})
