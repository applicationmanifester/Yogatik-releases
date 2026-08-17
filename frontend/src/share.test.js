import { describe, it, expect, afterEach } from 'vitest'
import { SHARE_URL, buildShareText, isInstalledApp, shareTargets, nativeShareAvailable } from './share'

describe('isInstalledApp', () => {
  afterEach(() => { delete globalThis.window; delete globalThis.navigator })

  it('is false in a plain browser tab', () => {
    globalThis.window = { matchMedia: () => ({ matches: false }) }
    globalThis.navigator = {}
    expect(isInstalledApp()).toBe(false)
  })

  it('is true in the Electron desktop shell', () => {
    globalThis.window = { __YOGATIK_ELECTRON__: true, matchMedia: () => ({ matches: false }) }
    globalThis.navigator = {}
    expect(isInstalledApp()).toBe(true)
  })

  it('is true in the Tauri desktop shell', () => {
    globalThis.window = { __TAURI__: {}, matchMedia: () => ({ matches: false }) }
    globalThis.navigator = {}
    expect(isInstalledApp()).toBe(true)
  })

  it('is true for an installed PWA (display-mode: standalone)', () => {
    globalThis.window = { matchMedia: (q) => ({ matches: q.includes('standalone') }) }
    globalThis.navigator = {}
    expect(isInstalledApp()).toBe(true)
  })

  it('is true for an installed PWA on iOS (navigator.standalone)', () => {
    globalThis.window = { matchMedia: () => ({ matches: false }) }
    globalThis.navigator = { standalone: true }
    expect(isInstalledApp()).toBe(true)
  })

  it('never throws when matchMedia is missing', () => {
    globalThis.window = {}
    globalThis.navigator = {}
    expect(() => isInstalledApp()).not.toThrow()
    expect(isInstalledApp()).toBe(false)
  })
})

describe('buildShareText', () => {
  it('includes the app URL so the link is always shareable', () => {
    expect(buildShareText().url).toBe(SHARE_URL)
  })

  it('has a title and a short body', () => {
    const s = buildShareText()
    expect(s.title).toMatch(/yogatik/i)
    expect(s.text.length).toBeGreaterThan(10)
    expect(s.text.length).toBeLessThan(300)
  })

  it('produces a single clipboard string containing the url', () => {
    expect(buildShareText().clipboard).toContain(SHARE_URL)
  })
})


describe('shareTargets', () => {
  const targets = shareTargets()

  it('offers several apps, not just one', () => {
    // Electron has no navigator.share and Windows exposes no Share charm to it,
    // so Share fell through to a silent clipboard copy and looked broken.
    expect(targets.length).toBeGreaterThanOrEqual(5)
  })

  it('every target carries the share URL', () => {
    for (const t of targets) expect(decodeURIComponent(t.href)).toContain(SHARE_URL)
  })

  it('percent-encodes the payload so links do not break on spaces', () => {
    for (const t of targets) {
      expect(t.href.slice(t.href.indexOf('?') + 1)).not.toMatch(/ /)
    }
  })

  it('uses only schemes the desktop shell can open', () => {
    for (const t of targets) expect(t.href).toMatch(/^(https:|mailto:)/)
  })

  it('gives each target a unique id and a label', () => {
    const ids = targets.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of targets) expect(t.label.length).toBeGreaterThan(0)
  })
})

describe('nativeShareAvailable', () => {
  it('is false where the platform has no sheet (Electron)', () => {
    globalThis.navigator = {}
    expect(nativeShareAvailable()).toBe(false)
  })

  it('is true where the platform provides one', () => {
    globalThis.navigator = { share: () => Promise.resolve() }
    expect(nativeShareAvailable()).toBe(true)
  })
})
