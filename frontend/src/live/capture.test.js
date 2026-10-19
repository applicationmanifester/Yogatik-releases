import { describe, it, expect } from 'vitest'
import { zoomPlan, clampZoom, ZOOM_MIN, ZOOM_MAX, MIN_CROP_EDGE,
  torchSupported, setTorch, laplacianVariance, pickSharpest,
  isDarkAnalysis, lowLightHint, batteryBucket, TOO_DARK_MEAN } from './capture'

describe('zoomPlan', () => {
  it('returns zero rect when dims missing', () => {
    expect(zoomPlan({})).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0, zoom: 1 })
    expect(zoomPlan({ width: 0, height: 720 })).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0, zoom: 1 })
  })
  it('clamps zoom to 1..4', () => {
    expect(zoomPlan({ width: 1280, height: 720 }, 0.5).zoom).toBe(1)
    // 720p at 4x would give 180px edge (< 240 MIN_CROP_EDGE) so clamps to 3
    expect(zoomPlan({ width: 1280, height: 720 }, 10).zoom).toBe(3)
  })
  it('respects MIN_CROP_EDGE on small frames', () => {
    // 720p at 4x zoom would give 180px edge — below 240 → clamp to 3
    const plan = zoomPlan({ width: 1280, height: 720 }, 4)
    expect(plan.zoom).toBe(3)
    expect(plan.sw).toBeGreaterThanOrEqual(MIN_CROP_EDGE)
  })
  it('profile crop multiplies with zoom', () => {
    const z1 = zoomPlan({ width: 1920, height: 1080 }, 2, 1) // full frame
    const z2 = zoomPlan({ width: 1920, height: 1080 }, 2, 0.5) // centre half
    expect(z2.sw).toBeLessThan(z1.sw)
    expect(z2.sh).toBeLessThan(z1.sh)
    // the crop and zoom multiply: 0.5 * 1/2 = 0.25 of original each edge
    expect(Math.round(z2.sw / 1920 * 100)).toBe(25)
  })
  it('request zoom never exceeds what edges allow', () => {
    const plan = zoomPlan({ width: 480, height: 640 }, 4)
    expect(plan.zoom).toBeLessThanOrEqual(2) // 480/240 = 2
  })
  it('sx/sy centers the crop', () => {
    const plan = zoomPlan({ width: 1000, height: 1000 }, 2)
    expect(plan.sx).toBe(plan.sy)
    // With 2x zoom, crop is half the frame (500x500), centered at 250, so sx+sw = 250+500 = 750
    expect(plan.sx + plan.sw).toBe(750)
  })
})

describe('clampZoom', () => {
  it('passes through valid zoom', () => {
    expect(clampZoom(2.5)).toBe(2.5)
  })
  it('clamps to min/max', () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN)
    expect(clampZoom(10)).toBe(ZOOM_MAX)
  })
  it('handles NaN/invalid', () => {
    expect(clampZoom(NaN)).toBe(ZOOM_MIN)
    expect(clampZoom('foo')).toBe(ZOOM_MIN)
  })
})

describe('torchSupported', () => {
  it('returns false for null/undefined', () => {
    expect(torchSupported(null)).toBe(false)
    expect(torchSupported(undefined)).toBe(false)
  })
  it('returns false for track without getCapabilities', () => {
    expect(torchSupported({})).toBe(false)
  })
  it('returns false when capabilities lacks torch', () => {
    expect(torchSupported({ getCapabilities: () => ({}) })).toBe(false)
  })
  it('returns true when torch=true', () => {
    expect(torchSupported({ getCapabilities: () => ({ torch: true }) })).toBe(true)
  })
})

describe('setTorch', () => {
  it('rejects unsupported track', async () => {
    const r = await setTorch(null, true)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('torch')
  })
  it('rejects on applyConstraints throw', async () => {
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints: async () => { throw new Error('hardware refused') }
    }
    const r = await setTorch(track, true)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('hardware refused')
  })
  it('returns ok on success', async () => {
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints: async () => {}
    }
    const r = await setTorch(track, true)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeNull()
  })
})

describe('laplacianVariance', () => {
  it('returns 0 for invalid inputs', () => {
    expect(laplacianVariance(null, 10, 10)).toBe(0)
    expect(laplacianVariance(new Uint8Array(10), 1, 1)).toBe(0)
  })
  it('computes variance on uniform image (should be 0)', () => {
    const rgba = new Uint8Array(10 * 10 * 4).fill(128)
    const v = laplacianVariance(rgba, 10, 10)
    expect(v).toBe(0)
  })
  it('non-zero on edge image', () => {
    // sharp edge: left half black, right half white
    const w = 8, h = 8
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < w/2 ? 0 : 255
        const i = (y * w + x) * 4
        rgba[i] = rgba[i+1] = rgba[i+2] = v
        rgba[i+3] = 255
      }
    }
    const v = laplacianVariance(rgba, w, h)
    expect(v).toBeGreaterThan(0)
  })
})

describe('pickSharpest', () => {
  it('returns null for empty', () => {
    expect(pickSharpest([])).toBeNull()
    // Returns the input object as-is; index/score only added if present
    expect(pickSharpest([{ frame: 'a' }])).toEqual({ frame: 'a' })
  })
  it('picks highest score', () => {
    const cands = [
      { frame: 'a', score: 10 },
      { frame: 'b', score: 50 },
      { frame: 'c', score: 30 },
    ]
    expect(pickSharpest(cands).frame).toBe('b')
  })
  it('ties go to earlier candidate', () => {
    const cands = [
      { frame: 'a', score: 50 },
      { frame: 'b', score: 50 },
    ]
    expect(pickSharpest(cands).frame).toBe('a')
  })
  it('ignores non-finite scores (treats as -Infinity)', () => {
    const cands = [
      { frame: 'a', score: NaN },
      { frame: 'b', score: 10 },
    ]
    expect(pickSharpest(cands).frame).toBe('b')
  })
})

describe('isDarkAnalysis', () => {
  it('reads nested luma.mean shape', () => {
    expect(isDarkAnalysis({ luma: { mean: 10, dark: 0.9 } })).toBe(true)
    expect(isDarkAnalysis({ luma: { mean: 100, dark: 0.1 } })).toBe(false)
  })
  it('reads flat meanLuma/darkFraction shape', () => {
    expect(isDarkAnalysis({ meanLuma: 5, darkFraction: 0.95 })).toBe(true)
    expect(isDarkAnalysis({ meanLuma: 70, darkFraction: 0.1 })).toBe(false)
  })
  it('returns false for missing', () => {
    expect(isDarkAnalysis({})).toBe(false)
    expect(isDarkAnalysis({ luma: {} })).toBe(false)
  })
})

describe('lowLightHint', () => {
  it('returns hint when dark + torch supported', () => {
    expect(lowLightHint({ meanLuma: 5 }, { torchSupported: true })).toBe('Too dark — tap the torch')
  })
  it('returns null when not dark', () => {
    expect(lowLightHint({ meanLuma: 100 }, { torchSupported: true })).toBeNull()
  })
  it('returns null when torch not supported', () => {
    expect(lowLightHint({ meanLuma: 5 }, { torchSupported: false })).toBeNull()
  })
})

describe('batteryBucket', () => {
  it('maps 0..1 to 0..10', () => {
    expect(batteryBucket(0.05)).toBe(0)
    expect(batteryBucket(0.5)).toBe(5)
    expect(batteryBucket(0.99)).toBe(9)
    expect(batteryBucket(1.0)).toBe(10)
  })
  it('clamps and floors', () => {
    expect(batteryBucket(-0.1)).toBe(0)
    expect(batteryBucket(1.1)).toBe(10)
    expect(batteryBucket(NaN)).toBe(-1)
    expect(batteryBucket(null)).toBe(-1)
  })
})