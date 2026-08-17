import { describe, it, expect, afterEach } from 'vitest'
import { videoEditTool } from './tools/videoEdit'
import { trimMapper, concatMapper } from './video/decode'

describe('video_edit tool', () => {
  afterEach(() => { /* jsdom document stays; nothing to restore */ })

  it('requires a source', async () => {
    const r = await videoEditTool.execute({})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/media_id.*url/i)
  })

  it('reports a missing stored video rather than throwing', async () => {
    const r = await videoEditTool.execute({ media_id: 'does-not-exist' })
    expect(r.success).toBe(false)
    expect(r.error).toBeTruthy()
  })

  // The description must warn about audio up front — a silent clip discovered
  // on playback is a bad surprise.
  it('warns in its own description that the result has no audio', () => {
    expect(videoEditTool.schema.description).toMatch(/no audio/i)
  })

  it('exposes trim, speed and quality controls', () => {
    const p = videoEditTool.schema.parameters.properties
    for (const k of ['start', 'end', 'speed', 'fps', 'quality', 'media_id', 'url']) {
      expect(p[k]).toBeTruthy()
    }
  })
})

describe('frame mappers', () => {
  it('trimMapper offsets from the trim start', () => {
    const m = trimMapper({ startSec: 10, fps: 30 })
    expect(m(0)).toBe(10)
    expect(m(30)).toBe(11)
  })

  it('trimMapper advances faster when sped up', () => {
    const m = trimMapper({ startSec: 0, fps: 30, speed: 2 })
    expect(m(30)).toBe(2) // one output second consumes two source seconds
  })

  it('concatMapper finds the owning segment', () => {
    const segs = [
      { source: 'a', startFrame: 0, totalFrames: 30, sourceStartSec: 0 },
      { source: 'b', startFrame: 30, totalFrames: 30, sourceStartSec: 5 },
    ]
    const m = concatMapper(segs, 30)
    expect(m(0).source).toBe('a')
    expect(m(30).source).toBe('b')
    expect(m(30).time).toBe(5)
  })

  it('concatMapper returns null past the end so the sampler paints black', () => {
    expect(concatMapper([{ source: 'a', startFrame: 0, totalFrames: 10, sourceStartSec: 0 }], 30)(99)).toBeNull()
  })
})
