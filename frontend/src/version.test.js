import { describe, it, expect, beforeEach } from 'vitest'
import { APP_VERSION, APP_CODENAME, APP_RELEASES, getRelease, hasSeenCurrentVersion, markCurrentVersionAsSeen } from './version'

describe('App Versioning & Release Updates Registry', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defines valid current version and releases', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(APP_CODENAME).toBeTruthy()
    expect(APP_RELEASES.length).toBeGreaterThan(0)
    expect(APP_RELEASES[0].version).toBe(APP_VERSION)
    expect(APP_RELEASES[0].isLatest).toBe(true)
  })

  it('retrieves release by version string', () => {
    const latest = getRelease(APP_VERSION)
    expect(latest).toBeDefined()
    expect(latest.version).toBe(APP_VERSION)
    expect(latest.highlights.length).toBeGreaterThan(0)
    expect(latest.sections.length).toBeGreaterThan(0)
  })

  it('tracks whether current version has been seen', () => {
    expect(hasSeenCurrentVersion()).toBe(false)
    markCurrentVersionAsSeen()
    expect(hasSeenCurrentVersion()).toBe(true)
  })
})
