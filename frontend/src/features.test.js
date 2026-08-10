import { describe, it, expect, vi } from 'vitest'
import { resolveFeatures, isEnabled, buzz, FEATURE_DEFAULTS, FEATURES } from './features'

describe('feature switches', () => {
  it('defaults a feature the user has never seen to its shipped value', () => {
    const stored = { compare: false }               // saved before `usage` existed
    const f = resolveFeatures(stored)
    expect(f.compare).toBe(false)
    expect(f.usage).toBe(FEATURES.usage.default)
  })

  it('survives no stored preferences at all', () => {
    expect(resolveFeatures(undefined)).toEqual(FEATURE_DEFAULTS)
    expect(resolveFeatures(null)).toEqual(FEATURE_DEFAULTS)
  })

  it('treats only an explicit false as off', () => {
    expect(isEnabled({ live: false }, 'live')).toBe(false)
    expect(isEnabled({}, 'live')).toBe(true)
    expect(isEnabled({ live: undefined }, 'live')).toBe(true)
  })

  it('keeps auto-scan off unless asked for — it costs tokens', () => {
    expect(FEATURE_DEFAULTS.autoScan).toBe(false)
  })
})

describe('buzz', () => {
  it('vibrates only when haptics are on and the device can', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })

    buzz({}, 30)
    expect(vibrate).toHaveBeenCalledWith(30)

    vibrate.mockClear()
    buzz({ haptics: false }, 30)
    expect(vibrate).not.toHaveBeenCalled()

    vi.stubGlobal('navigator', {})
    expect(() => buzz({}, 30)).not.toThrow()
    vi.unstubAllGlobals()
  })
})
