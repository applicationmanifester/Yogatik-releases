// @vitest-environment node
//
// Pure mask maths — no DOM, no model, no network. The whole point of splitting
// maskOps out of sam.js is that this file runs in milliseconds and needs none
// of the 40MB the segmenter downloads.
import { describe, it, expect } from 'vitest'
import {
  maskArea, maskBBox, maskIoU, stabilityScore, connectedComponents,
  removeSmallRegions, largestComponent, maskToRle, rleToMask, maskNms,
  pickBestMask, padBox, thresholdMask,
} from './maskOps'

const W = 10, H = 10
const blank = () => new Uint8Array(W * H)
const rect = (x0, y0, w, h) => {
  const m = blank()
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m[y * W + x] = 1
  return m
}

describe('geometry', () => {
  it('measures area and a tight box', () => {
    const r = rect(2, 3, 4, 2)
    expect(maskArea(r)).toBe(8)
    expect(maskBBox(r, W, H)).toEqual({ x: 2, y: 3, width: 4, height: 2 })
  })

  it('an empty mask has no box, rather than a zero-sized one at the origin', () => {
    // A {0,0,0,0} box crops to nothing and reads downstream as a valid result.
    expect(maskBBox(blank(), W, H)).toBeNull()
  })

  it('IoU is 1 for identical and 0 for disjoint', () => {
    const r = rect(2, 3, 4, 2)
    expect(maskIoU(r, r)).toBe(1)
    expect(maskIoU(rect(0, 0, 2, 2), rect(8, 8, 2, 2))).toBe(0)
  })

  it('padding clamps to the image', () => {
    const p = padBox({ x: 0, y: 0, width: 4, height: 4 }, 5, W, H)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
    expect(p.width).toBeLessThanOrEqual(W)
    expect(p.height).toBeLessThanOrEqual(H)
  })
})

describe('stability score', () => {
  it('is 1 for a crisp boundary and low for a smear', () => {
    const crisp = new Float32Array(100).fill(-10)
    for (let i = 0; i < 50; i++) crisp[i] = 10
    expect(stabilityScore(crisp, 0, 1)).toBe(1)

    const smear = new Float32Array(100)
    for (let i = 0; i < 100; i++) smear[i] = (i - 50) / 100   // everything within ±1 of the threshold
    expect(stabilityScore(smear, 0, 1)).toBeLessThan(0.6)
  })

  it('returns 0, not Infinity, when the lower threshold is also empty', () => {
    // high/low with low === 0 is the shape that reports PERFECT stability for
    // a mask containing nothing at all.
    expect(stabilityScore(new Float32Array(100).fill(-100), 0, 1)).toBe(0)
  })

  it('thresholdMask agrees with the score it is scored by', () => {
    const logits = new Float32Array([-1, 0, 1, 2])
    expect(Array.from(thresholdMask(logits, 0))).toEqual([0, 0, 1, 1])
  })
})

describe('cleanup', () => {
  it('removes speckle that would otherwise make the box the whole image', () => {
    // This is the actual bug this exists to prevent: one stray pixel in the
    // far corner turns "crop to the object" into "return the original photo",
    // which looks exactly like the crop silently doing nothing.
    const speckled = rect(2, 3, 4, 2)
    speckled[99] = 1
    expect(maskBBox(speckled, W, H).width).toBe(8)

    const cleaned = removeSmallRegions(speckled, W, H, 4, 'islands')
    expect(maskArea(cleaned)).toBe(8)
    expect(maskBBox(cleaned, W, H)).toEqual({ x: 2, y: 3, width: 4, height: 2 })
  })

  it('fills pinholes inside the object', () => {
    const holed = rect(2, 2, 5, 5)
    holed[4 * W + 4] = 0
    expect(maskArea(holed)).toBe(24)
    expect(maskArea(removeSmallRegions(holed, W, H, 4, 'holes'))).toBe(25)
  })

  it('keeps only the largest component', () => {
    const big = rect(0, 0, 4, 4)
    big[9 * W + 9] = 1
    expect(maskArea(largestComponent(big, W, H))).toBe(16)
  })

  it('labels components without recursing', () => {
    // Iterative on purpose: a mask covering a 1024x1024 image is a
    // million-deep recursion and a blown stack — the same shape of failure
    // fsIndex's walk had before it was flattened.
    const two = blank()
    two[0] = 1; two[1] = 1; two[99] = 1
    const { sizes } = connectedComponents(two, W, H)
    expect(sizes).toEqual([2, 1])

    const full = new Uint8Array(W * H).fill(1)
    expect(() => connectedComponents(full, W, H)).not.toThrow()
  })
})

describe('RLE', () => {
  it('round-trips exactly', () => {
    const r = rect(2, 3, 4, 2)
    expect(Array.from(rleToMask(maskToRle(r, W, H)))).toEqual(Array.from(r))
  })

  it('round-trips an ASYMMETRIC mask — a square one hides an axis swap', () => {
    // COCO RLE is column-major. Encoded along the wrong axis it decodes to
    // noise with the correct pixel count, so every size check still passes and
    // only the picture is wrong.
    const strip = rect(1, 6, 7, 1)
    expect(Array.from(rleToMask(maskToRle(strip, W, H)))).toEqual(Array.from(strip))
  })

  it('reports size as [height, width] and accounts for every pixel', () => {
    const rle = maskToRle(rect(2, 3, 4, 2), W, H)
    expect(rle.size).toEqual([H, W])
    expect(rle.counts.reduce((a, b) => a + b, 0)).toBe(W * H)
  })
})

describe('candidate selection', () => {
  it('suppresses duplicate masks and keeps the higher score', () => {
    // SAM returns whole-object / part / sub-part for one prompt, and they
    // overlap heavily — without this the caller gets three spellings of one
    // answer.
    const kept = maskNms([
      { mask: rect(2, 3, 4, 2), score: 0.9 },
      { mask: rect(2, 3, 4, 2), score: 0.5 },
      { mask: rect(8, 8, 2, 2), score: 0.8 },
    ], 0.7)
    expect(kept).toHaveLength(2)
    expect(kept[0].score).toBe(0.9)
  })

  it('refuses a mask covering the whole frame', () => {
    // "Segment the pill" returning the entire photograph is confidently wrong
    // and reads downstream as success.
    const best = pickBestMask([
      { mask: new Uint8Array(W * H).fill(1), iou: 0.99, stability: 0.99 },
      { mask: rect(2, 3, 4, 2), iou: 0.8, stability: 0.9 },
    ], { width: W, height: H })
    expect(best.area).toBe(8)
  })

  it('returns null when nothing is usable', () => {
    expect(pickBestMask([{ mask: blank(), iou: 1, stability: 1 }], { width: W, height: H })).toBeNull()
  })

  it('weighs measured stability against the model\'s own opinion', () => {
    // The model's predicted IoU is only its opinion; a mask can score well and
    // still be a smear.
    const best = pickBestMask([
      { mask: rect(0, 0, 3, 3), iou: 0.95, stability: 0.1 },
      { mask: rect(5, 5, 3, 3), iou: 0.8, stability: 0.99 },
    ], { width: W, height: H })
    expect(best.iou).toBe(0.8)
  })
})
