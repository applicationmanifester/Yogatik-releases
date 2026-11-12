import { describe, it, expect } from 'vitest'
import { sharpen, stretchContrast, toGrayscale, adaptiveEnhanceRgba, adaptiveEnhanceCanvas } from './preprocess'

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

describe('adaptive image enhancement for dark/low-contrast captures', () => {
  it('detects and rescues an underexposed/dark image', () => {
    // 4x4 very dark image (mean luminance around 30)
    const w = 4, h = 4
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 30
      rgba[i + 1] = 30
      rgba[i + 2] = 30
      rgba[i + 3] = 255
    }
    // Add subtle text gradient (values 45..50)
    rgba[0] = rgba[1] = rgba[2] = 50

    const res = adaptiveEnhanceRgba(rgba, w, h)
    expect(res.enhanced).toBe(true)
    expect(res.meanAfter).toBeGreaterThan(res.meanBefore)
    expect(res.gamma).toBeLessThan(1.0) // gamma expansion applied
  })

  it('leaves a well-balanced image untouched', () => {
    // 4x4 balanced image (mean luminance 140, spread 0..255)
    const w = 4, h = 4
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const v = Math.round((i / (w * h - 1)) * 255)
      rgba[i * 4] = v
      rgba[i * 4 + 1] = v
      rgba[i * 4 + 2] = v
      rgba[i * 4 + 3] = 255
    }

    const res = adaptiveEnhanceRgba(rgba, w, h)
    expect(res.enhanced).toBe(false)
    expect(res.reason).toContain('already optimal')
  })

  it('safely handles canvas enhancement', () => {
    const mockData = new Uint8ClampedArray(4 * 4 * 4).fill(30)
    const mockImageData = { data: mockData, width: 4, height: 4 }
    const canvas = {
      width: 4,
      height: 4,
      getContext: () => ({
        getImageData: () => mockImageData,
        putImageData: () => {},
      }),
    }

    const res = adaptiveEnhanceCanvas(canvas)
    expect(res.enhanced).toBe(true)
    expect(res.reason).toContain('rescued underexposed image')
  })
})
