import { describe, it, expect } from 'vitest'
import { sharpen, stretchContrast, toGrayscale } from './preprocess'

/**
 * These used to test vision/macroEnhancer.js, a second copy of maths
 * preprocess.js already owned that nothing in the app imported. The tests
 * passed the whole time the feature was unreachable — a green test on dead code
 * reads exactly like a working feature.
 *
 * The unsharp mask was the part worth keeping (contrast stretching cannot
 * rescue an ENGRAVED marking: the glyph is the same colour as its background,
 * only shadowed), so it lives in preprocess.js as `sharpen` and these test it
 * there.
 */
describe('macro/engraved-text preprocessing', () => {
  it('stretches a low-dynamic-range buffer to the full range', () => {
    // 2x2 grey ramp, 100..150 — the situation a flat macro shot produces.
    const rgba = new Uint8ClampedArray([
      100, 100, 100, 255, 120, 120, 120, 255,
      130, 130, 130, 255, 150, 150, 150, 255,
    ])
    // Default clip (2%) — clip:0 is a no-op by construction, because the first
    // bucket already satisfies `acc >= 0`.
    stretchContrast(toGrayscale(rgba))
    expect(rgba[0]).toBe(0)
    expect(rgba[12]).toBe(255)
  })

  it('sharpen leaves a FLAT region flat', () => {
    // A Laplacian sums to zero over constant input. If this drifts, the filter
    // is brightening or darkening the whole image instead of finding edges,
    // which is worse than not sharpening at all.
    const rgba = new Uint8ClampedArray(3 * 3 * 4).fill(128)
    sharpen(rgba, 3, 3)
    expect(rgba[(1 * 3 + 1) * 4]).toBe(128)
  })

  it('sharpen amplifies an edge rather than smoothing it', () => {
    // 3x3 with a single dark centre on a light field: the relief case.
    const w = 3, h = 3
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const v = i === 4 ? 120 : 140
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
      rgba[i * 4 + 3] = 255
    }
    sharpen(rgba, w, h)
    // Centre must move AWAY from its neighbours (darker), not towards them.
    expect(rgba[4 * 4]).toBeLessThan(120)
  })

  it('writes r=g=b so the result stays a valid grayscale buffer', () => {
    const rgba = new Uint8ClampedArray(3 * 3 * 4).fill(200)
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
    sharpen(rgba, 3, 3)
    const c = (1 * 3 + 1) * 4
    expect(rgba[c]).toBe(rgba[c + 1])
    expect(rgba[c + 1]).toBe(rgba[c + 2])
    expect(rgba[c + 3]).toBe(255) // alpha untouched
  })
})
