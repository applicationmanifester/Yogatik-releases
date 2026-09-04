import { describe, it, expect, beforeEach } from 'vitest'
import { TemporalVideoBuffer } from './temporalBuffer'

describe('TemporalVideoBuffer', () => {
  let buffer

  beforeEach(() => {
    buffer = new TemporalVideoBuffer({ maxFrames: 4, maxEdge: 640, quality: 0.75 })
  })

  it('calculates even dimensions scaled to maxEdge', () => {
    const d1 = buffer.calcDimensions(1920, 1080, 640)
    expect(d1.width).toBeLessThanOrEqual(640)
    expect(d1.height).toBeLessThanOrEqual(640)
    expect(d1.width % 2).toBe(0)
    expect(d1.height % 2).toBe(0)

    const d2 = buffer.calcDimensions(105, 99, 640)
    expect(d2.width % 2).toBe(0)
    expect(d2.height % 2).toBe(0)
  })

  it('manages ring buffer frame limit', () => {
    // Mock frames directly
    for (let i = 1; i <= 6; i++) {
      buffer.frames.push({
        timestamp: Date.now() - (6 - i) * 1000,
        base64: `img${i}`,
        dataUrl: `data:image/jpeg;base64,img${i}`,
        width: 320,
        height: 240,
      })
      if (buffer.frames.length > buffer.maxFrames) {
        buffer.frames.shift()
      }
    }

    expect(buffer.count).toBe(4)
    expect(buffer.frames[0].base64).toBe('img3')
    expect(buffer.frames[3].base64).toBe('img6')
  })

  it('picks evenly spaced keyframes', () => {
    for (let i = 1; i <= 5; i++) {
      buffer.frames.push({
        timestamp: Date.now() - (5 - i) * 1000,
        base64: `img${i}`,
        dataUrl: `data:image/jpeg;base64,img${i}`,
        width: 320,
        height: 240,
      })
    }

    const keyframes = buffer.getKeyframes(3)
    expect(keyframes.length).toBe(3)
    expect(keyframes[0].base64).toBe('img1')
    expect(keyframes[2].base64).toBe('img5')
    expect(keyframes[2].label).toContain('Now')
  })

  it('builds multimodal prompt parts with timestamps', () => {
    buffer.frames.push({
      timestamp: Date.now() - 2000,
      base64: 'frame1',
      dataUrl: 'data:image/jpeg;base64,frame1',
      width: 320,
      height: 240,
    })
    buffer.frames.push({
      timestamp: Date.now(),
      base64: 'frame2',
      dataUrl: 'data:image/jpeg;base64,frame2',
      width: 320,
      height: 240,
    })

    const parts = buffer.buildMultimodalPrompt('What moved?')
    expect(parts[0].type).toBe('text')
    expect(parts[0].text).toContain('What moved?')
    expect(parts.some(p => p.type === 'image_url' && p.image_url?.url?.includes('frame1'))).toBe(true)
    expect(parts.some(p => p.type === 'image_url' && p.image_url?.url?.includes('frame2'))).toBe(true)
  })
})
