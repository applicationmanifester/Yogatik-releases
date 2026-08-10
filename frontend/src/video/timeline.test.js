import { describe, it, expect } from 'vitest'
import { normalizeSpec, frameAt, wrapText, stagger, coverFit, LIMITS } from './timeline'

const spec = (over = {}) => normalizeSpec({
  scenes: [
    { type: 'title', text: 'Hello', duration: 2 },
    { type: 'text', bullets: ['a', 'b'], duration: 3 },
  ],
  ...over,
})

describe('normalizeSpec', () => {
  it('lays scenes end to end in frames', () => {
    const s = spec({ fps: 30 })
    expect(s.scenes[0]).toMatchObject({ startFrame: 0, endFrame: 60 })
    expect(s.scenes[1]).toMatchObject({ startFrame: 60, endFrame: 150 })
    expect(s.totalFrames).toBe(150)
    expect(s.durationSec).toBe(5)
  })

  it('forces even dimensions — H.264 rejects odd ones', () => {
    const s = spec({ width: 1281, height: 721 })
    expect(s.width % 2).toBe(0)
    expect(s.height % 2).toBe(0)
  })

  it('clamps fps and scene length instead of trusting the model', () => {
    const s = spec({ fps: 999, scenes: [{ type: 'title', text: 'x', duration: 9999 }] })
    expect(s.fps).toBe(LIMITS.maxFps)
    expect(s.scenes[0].seconds).toBeLessThanOrEqual(LIMITS.maxSceneSec)
  })

  it('rejects specs it cannot render', () => {
    expect(() => normalizeSpec({ scenes: [] })).toThrow(/at least one scene/i)
    expect(() => normalizeSpec({ scenes: [{ type: 'hologram' }] })).toThrow(/unknown type/i)
    expect(() => normalizeSpec({ scenes: [{ type: 'image' }] })).toThrow(/image_url/)
    expect(() => normalizeSpec({ scenes: [{ type: 'bars' }] })).toThrow(/data/)
  })

  it('refuses a video longer than the cap', () => {
    const many = Array.from({ length: 20 }, () => ({ type: 'title', text: 'x', duration: 30 }))
    expect(() => normalizeSpec({ scenes: many })).toThrow(/longer than/i)
  })
})

describe('frameAt', () => {
  it('maps a frame to its scene and progress', () => {
    const s = spec({ fps: 30, transition: 'cut' })
    expect(frameAt(s, 0)).toMatchObject({ index: 0, t: 0 })
    expect(frameAt(s, 59).t).toBeCloseTo(1, 5)
    expect(frameAt(s, 60)).toMatchObject({ index: 1, t: 0 })
  })

  it('clamps out-of-range frames rather than returning undefined', () => {
    const s = spec()
    expect(frameAt(s, -5).index).toBe(0)
    expect(frameAt(s, 99999).index).toBe(s.scenes.length - 1)
  })

  it('fades in at every cut and out at the very end', () => {
    const s = spec({ fps: 30, fade: 0.5 })
    expect(frameAt(s, 0).alpha).toBe(0)              // start of scene 1
    expect(frameAt(s, 60).alpha).toBe(0)             // start of scene 2
    expect(frameAt(s, 30).alpha).toBe(1)             // mid-scene, fully lit
    expect(frameAt(s, s.totalFrames - 1).alpha).toBe(0)
  })

  it('does not fade when transition is cut', () => {
    const s = spec({ transition: 'cut' })
    expect(frameAt(s, 0).alpha).toBe(1)
  })
})

describe('layout helpers', () => {
  const measure = (str) => str.length * 10   // 10px per character

  it('wraps on width and preserves explicit newlines', () => {
    expect(wrapText('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText('one\ntwo', 1000, measure)).toEqual(['one', 'two'])
  })

  it('never loses a word that is wider than the line', () => {
    expect(wrapText('supercalifragilistic', 50, measure)).toEqual(['supercalifragilistic'])
  })

  it('staggers items so later ones arrive later', () => {
    expect(stagger(0, 3, 5)).toBe(0)
    expect(stagger(1, 3, 5)).toBe(1)
    expect(stagger(0.3, 0, 5)).toBeGreaterThan(stagger(0.3, 3, 5))
  })

  it('cover-fits without letterboxing', () => {
    const box = coverFit(100, 100, 1280, 720)
    expect(box.w).toBeGreaterThanOrEqual(1280)
    expect(box.h).toBeGreaterThanOrEqual(720)
    expect(box.x).toBeCloseTo((1280 - box.w) / 2, 5)
  })
})
