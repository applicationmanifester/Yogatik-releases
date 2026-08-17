import { describe, it, expect, afterEach } from 'vitest'
import { SHARE_URL, buildShareText, isInstalledApp } from './share'

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
