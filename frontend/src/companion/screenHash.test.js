// @vitest-environment node
//
// The half under test here is pure pixel maths — no canvas, no DOM — and the
// node environment is what lets it stay that way.
import { describe, it, expect } from 'vitest'
import { hashFromRgba, HASH_EDGE } from './screenHash'
import { hammingDistance, createWatchState, shouldLook, noteLook, DEFAULTS } from './watch'

/** HASH_EDGE^2 pixels; `pick(i)` returns the grey level for pixel i. */
const frame = (pick) => {
  const n = HASH_EDGE * HASH_EDGE
  const out = new Uint8ClampedArray(n * 4)
  for (let p = 0; p < n; p++) {
    const v = pick(p)
    out[p * 4] = v; out[p * 4 + 1] = v; out[p * 4 + 2] = v; out[p * 4 + 3] = 255
  }
  return out
}

describe('screen fingerprint', () => {
  it('is exactly as wide as watch.js compares', () => {
    // hammingDistance refuses hashes of different lengths (returns Infinity,
    // which reads as "changed"), and diffThreshold is calibrated to 64 bits.
    const h = hashFromRgba(frame((p) => p * 4))
    expect(h).toHaveLength(HASH_EDGE * HASH_EDGE)
    expect(h).toHaveLength(64)
    expect(DEFAULTS.diffThreshold).toBeLessThan(h.length)
  })

  it('gives the same screen the same hash, and a changed screen a different one', () => {
    const a = hashFromRgba(frame((p) => (p < 32 ? 10 : 240)))
    const b = hashFromRgba(frame((p) => (p < 32 ? 10 : 240)))
    const c = hashFromRgba(frame((p) => (p % 2 ? 10 : 240)))
    expect(hammingDistance(a, b)).toBe(0)
    expect(hammingDistance(a, c)).toBeGreaterThanOrEqual(DEFAULTS.diffThreshold)
  })

  it('a flat screen hashes without dividing by zero', () => {
    const h = hashFromRgba(frame(() => 128))
    expect(h).toBe('0'.repeat(64))
  })

  it('an empty buffer is unknown, not a hash', () => {
    expect(hashFromRgba(new Uint8ClampedArray(0))).toBeNull()
  })
})

describe('watching an unchanged screen', () => {
  it('does not spend a look — the gate this fingerprint exists to feed', () => {
    // The regression: the watcher called shouldLook({ hash: null }), so this
    // branch never ran and an idle desktop burned its hourly budget.
    const state = createWatchState()
    const hash = hashFromRgba(frame((p) => (p < 32 ? 10 : 240)))
    const t0 = 1_000_000

    expect(shouldLook(state, { now: t0, hash }).look).toBe(true)
    noteLook(state, { now: t0, hash })

    const later = t0 + DEFAULTS.intervalMs + 1
    expect(shouldLook(state, { now: later, hash }).look).toBe(false)

    const moved = hashFromRgba(frame((p) => (p % 2 ? 10 : 240)))
    expect(shouldLook(state, { now: later, hash: moved }).look).toBe(true)
  })

  it('still looks when the fingerprint is unavailable rather than going blind', () => {
    const state = createWatchState()
    const hash = hashFromRgba(frame((p) => (p < 32 ? 10 : 240)))
    noteLook(state, { now: 0, hash })
    expect(shouldLook(state, { now: DEFAULTS.intervalMs + 1, hash: null }).look).toBe(true)
  })
})
