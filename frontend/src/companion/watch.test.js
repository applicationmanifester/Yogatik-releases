import { describe, it, expect } from 'vitest'
import {
  createWatchState, shouldLook, noteLook, hammingDistance, remainingBudget, setPaused, DEFAULTS,
} from './watch'

const H = (s) => s.padEnd(64, '0')
const SAME = H('1010')
const DIFFERENT = H('0101010101010101')

describe('companion watch pacing', () => {
  it('looks the first time it is asked', () => {
    const s = createWatchState()
    expect(shouldLook(s, { now: 1_000_000, hash: SAME }).look).toBe(true)
  })

  it('will not look again inside the interval', () => {
    const s = createWatchState({ intervalMs: 20_000 })
    noteLook(s, { now: 1_000_000, hash: SAME })
    const r = shouldLook(s, { now: 1_005_000, hash: DIFFERENT })
    expect(r.look).toBe(false)
    expect(r.reason).toMatch(/too soon/i)
  })

  it('skips a look when the screen has not changed — the whole point', () => {
    const s = createWatchState({ intervalMs: 1000 })
    noteLook(s, { now: 1_000_000, hash: SAME })
    const r = shouldLook(s, { now: 1_100_000, hash: SAME })
    expect(r.look).toBe(false)
    expect(r.reason).toMatch(/not changed/i)
  })

  it('looks when the screen HAS changed', () => {
    const s = createWatchState({ intervalMs: 1000 })
    noteLook(s, { now: 1_000_000, hash: SAME })
    expect(shouldLook(s, { now: 1_100_000, hash: DIFFERENT }).look).toBe(true)
  })

  it('stops at the hourly budget however much the screen changes', () => {
    const s = createWatchState({ intervalMs: 0, maxPerHour: 3 })
    let t = 1_000_000
    for (let i = 0; i < 3; i++) { noteLook(s, { now: t, hash: H(String(i)) }); t += 1000 }
    const r = shouldLook(s, { now: t, hash: DIFFERENT })
    expect(r.look).toBe(false)
    expect(r.reason).toMatch(/budget/i)
  })

  it('lets the budget recover as the hour rolls forward', () => {
    const s = createWatchState({ intervalMs: 0, maxPerHour: 2 })
    noteLook(s, { now: 1_000_000, hash: H('a') })
    noteLook(s, { now: 1_001_000, hash: H('b') })
    expect(remainingBudget(s, 1_002_000)).toBe(0)
    expect(remainingBudget(s, 1_002_000 + 3_600_001)).toBe(2)
  })

  it('honours pause, and force overrides everything except nothing', () => {
    const s = createWatchState()
    setPaused(s, true)
    expect(shouldLook(s, { now: 9_000_000, hash: DIFFERENT }).look).toBe(false)
    setPaused(s, false)
    noteLook(s, { now: 9_000_000, hash: SAME })
    // Inside the interval AND unchanged — force still looks.
    expect(shouldLook(s, { now: 9_000_100, hash: SAME, force: true }).look).toBe(true)
  })

  it('measures hash difference, and refuses to compare mismatched hashes', () => {
    expect(hammingDistance('1100', '1010')).toBe(2)
    expect(hammingDistance('1100', '1100')).toBe(0)
    expect(hammingDistance('1100', 'abc')).toBe(Infinity)
    expect(hammingDistance(null, '1100')).toBe(Infinity)
  })

  it('looks when no fingerprint is available rather than going blind forever', () => {
    const s = createWatchState({ intervalMs: 0 })
    noteLook(s, { now: 1_000_000, hash: SAME })
    expect(shouldLook(s, { now: 1_100_000, hash: null }).look).toBe(true)
  })

  it('ships with a conservative default budget', () => {
    expect(DEFAULTS.intervalMs).toBeGreaterThanOrEqual(10_000)
    expect(DEFAULTS.maxPerHour).toBeLessThanOrEqual(60)
  })
})
