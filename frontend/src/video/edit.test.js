import { describe, it, expect } from 'vitest'
import {
  QUALITY, qualityPreset, bitrateForQuality, parseTimecode, formatTimecode,
  planTrim, planConcat, segmentAtFrame, planSpeed, fitDimensions,
} from './edit'

describe('qualityPreset', () => {
  it('returns the named preset', () => {
    expect(qualityPreset('high')).toBe(QUALITY.high)
  })

  it('is case-insensitive', () => {
    expect(qualityPreset('HIGH')).toBe(QUALITY.high)
  })

  it('falls back to standard for an unknown or missing name', () => {
    expect(qualityPreset('nonsense')).toBe(QUALITY.standard)
    expect(qualityPreset()).toBe(QUALITY.standard)
  })

  it('presets increase in fidelity', () => {
    expect(QUALITY.draft.bpp).toBeLessThan(QUALITY.standard.bpp)
    expect(QUALITY.standard.bpp).toBeLessThan(QUALITY.high.bpp)
    expect(QUALITY.high.bpp).toBeLessThan(QUALITY.max.bpp)
  })
})

describe('bitrateForQuality', () => {
  it('gives a higher bitrate for a higher preset at the same size', () => {
    const std = bitrateForQuality(1920, 1080, 30, 'standard')
    const high = bitrateForQuality(1920, 1080, 30, 'high')
    expect(high).toBeGreaterThan(std)
  })

  it('never exceeds the preset ceiling', () => {
    expect(bitrateForQuality(7680, 4320, 60, 'high')).toBeLessThanOrEqual(QUALITY.high.maxBitrate)
  })

  it('never drops below a usable floor', () => {
    expect(bitrateForQuality(64, 64, 12, 'draft')).toBeGreaterThanOrEqual(1e6)
  })
})

describe('parseTimecode', () => {
  it('parses plain seconds', () => {
    expect(parseTimecode('12.5')).toBe(12.5)
    expect(parseTimecode(30)).toBe(30)
  })

  it('parses m:ss', () => {
    expect(parseTimecode('1:30')).toBe(90)
  })

  it('parses h:mm:ss', () => {
    expect(parseTimecode('1:02:03')).toBe(3723)
  })

  it('returns null for junk rather than guessing', () => {
    expect(parseTimecode('abc')).toBeNull()
    expect(parseTimecode('1:2:3:4')).toBeNull()
    expect(parseTimecode('')).toBeNull()
    expect(parseTimecode(null)).toBeNull()
    expect(parseTimecode(-5)).toBeNull()
  })
})

describe('formatTimecode', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatTimecode(90)).toBe('1:30')
  })

  it('formats over an hour with hours', () => {
    expect(formatTimecode(3723)).toMatch(/^1:02:0?3/)
  })

  it('is safe for zero and junk', () => {
    expect(formatTimecode(0)).toBe('0:00')
    expect(formatTimecode(NaN)).toBe('0:00')
  })
})

describe('planTrim', () => {
  it('computes frames for a mid-clip trim', () => {
    const t = planTrim(60, { start: '0:10', end: '0:20', fps: 30 })
    expect(t.startSec).toBe(10)
    expect(t.endSec).toBe(20)
    expect(t.durationSec).toBe(10)
    expect(t.totalFrames).toBe(300)
  })

  it('defaults start to 0 and end to the clip duration', () => {
    const t = planTrim(42, { fps: 30 })
    expect(t.startSec).toBe(0)
    expect(t.endSec).toBe(42)
  })

  it('clamps a request past the end of the clip', () => {
    expect(planTrim(10, { start: 5, end: 999, fps: 30 }).endSec).toBe(10)
  })

  it('throws when the range is empty or inverted', () => {
    expect(() => planTrim(10, { start: 5, end: 5 })).toThrow(/after start/i)
    expect(() => planTrim(10, { start: 8, end: 2 })).toThrow(/after start/i)
  })

  it('never returns zero frames', () => {
    expect(planTrim(10, { start: 0, end: 0.001, fps: 30 }).totalFrames).toBeGreaterThanOrEqual(1)
  })
})

describe('planConcat', () => {
  const clips = [
    { source: 'a', durationSec: 2 },
    { source: 'b', durationSec: 3 },
    { source: 'c', durationSec: 1 },
  ]

  it('lays clips end to end with correct offsets', () => {
    const p = planConcat(clips, { fps: 30 })
    expect(p.durationSec).toBe(6)
    expect(p.segments.map(s => s.startSec)).toEqual([0, 2, 5])
    expect(p.totalFrames).toBe(180)
  })

  it('ignores empty or zero-length clips', () => {
    const p = planConcat([...clips, { source: 'd', durationSec: 0 }, null], { fps: 30 })
    expect(p.segments).toHaveLength(3)
  })

  it('handles an empty list', () => {
    expect(planConcat([], { fps: 30 })).toEqual({ segments: [], durationSec: 0, totalFrames: 0 })
  })
})

describe('segmentAtFrame', () => {
  const plan = planConcat([
    { source: 'a', durationSec: 1 },
    { source: 'b', durationSec: 1 },
  ], { fps: 30 })

  it('finds the owning clip for a frame', () => {
    expect(segmentAtFrame(plan, 0).source).toBe('a')
    expect(segmentAtFrame(plan, 29).source).toBe('a')
    expect(segmentAtFrame(plan, 30).source).toBe('b')
  })

  it('returns null past the end', () => {
    expect(segmentAtFrame(plan, 999)).toBeNull()
  })
})

describe('planSpeed', () => {
  it('halves duration at 2x', () => {
    expect(planSpeed(10, 2, { fps: 30 }).durationSec).toBe(5)
  })

  it('doubles duration at 0.5x', () => {
    expect(planSpeed(10, 0.5, { fps: 30 }).durationSec).toBe(20)
  })

  it('clamps an extreme factor and says so', () => {
    const p = planSpeed(10, 100)
    expect(p.factor).toBe(8)
    expect(p.clamped).toBe(true)
  })

  it('flags that audio needs resampling, rather than silently producing chipmunks', () => {
    expect(planSpeed(10, 2).audioNeedsResample).toBe(true)
    expect(planSpeed(10, 1).audioNeedsResample).toBe(false)
  })

  it('rejects a non-positive factor', () => {
    expect(() => planSpeed(10, 0)).toThrow(/greater than 0/i)
    expect(() => planSpeed(10, -1)).toThrow(/greater than 0/i)
  })
})

describe('fitDimensions', () => {
  it('always returns even dimensions (H.264 chroma)', () => {
    const d = fitDimensions(1921, 1081, 'high')
    expect(d.width % 2).toBe(0)
    expect(d.height % 2).toBe(0)
  })

  it('scales down to the preset edge, keeping it within bounds', () => {
    const d = fitDimensions(3840, 2160, 'standard')
    expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(QUALITY.standard.edge + 1)
  })

  it('does not upscale a small source', () => {
    const d = fitDimensions(640, 360, 'high')
    expect(d.width).toBe(640)
  })
})
