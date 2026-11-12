import { describe, it, expect } from 'vitest'
import { connectedComponents, objectDensitySignal } from './objectScan'

describe('objectScan: connectedComponents', () => {
  it('detects a dark object on a light background', () => {
    // 10x10 light background (240), with a 4x4 dark square (20) in the middle
    const w = 10, h = 10
    const rgba = new Uint8ClampedArray(w * h * 4).fill(240)
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        const i = (y * w + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 20
        rgba[i + 3] = 255
      }
    }

    const res = connectedComponents(rgba, w, h, { minArea: 10 })
    expect(res.count).toBe(1)
    expect(res.blobs[0].area).toBe(16)
    expect(res.blobs[0].w).toBe(4)
    expect(res.blobs[0].h).toBe(4)
    expect(res.blobs[0].x).toBe(3)
    expect(res.blobs[0].y).toBe(3)
    expect(res.background.isDarkTheme).toBe(false)
  })

  it('detects a bright object on a dark background (dark mode theme)', () => {
    // 10x10 dark background (20), with a 3x3 bright square (230)
    const w = 10, h = 10
    const rgba = new Uint8ClampedArray(w * h * 4).fill(20)
    for (let y = 2; y < 5; y++) {
      for (let x = 2; x < 5; x++) {
        const i = (y * w + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 230
        rgba[i + 3] = 255
      }
    }

    const res = connectedComponents(rgba, w, h, { minArea: 5 })
    expect(res.count).toBe(1)
    expect(res.blobs[0].area).toBe(9)
    expect(res.blobs[0].x).toBe(2)
    expect(res.blobs[0].y).toBe(2)
    expect(res.background.isDarkTheme).toBe(true)
  })

  it('detects a colored button on a neutral background', () => {
    // Grey background (128, 128, 128), red button (255, 0, 0)
    const w = 12, h = 12
    const rgba = new Uint8ClampedArray(w * h * 4).fill(128)
    for (let y = 4; y < 8; y++) {
      for (let x = 3; x < 9; x++) {
        const i = (y * w + x) * 4
        rgba[i] = 255
        rgba[i + 1] = 0
        rgba[i + 2] = 0
        rgba[i + 3] = 255
      }
    }

    const res = connectedComponents(rgba, w, h, { minArea: 10 })
    expect(res.count).toBe(1)
    expect(res.blobs[0].dominantColor.hex.toLowerCase()).toBe('#ff0000')
    expect(res.blobs[0].type).toBe('button_or_pill')
  })

  it('computes object density signal with layout classification', () => {
    const w = 20, h = 20
    const rgba = new Uint8ClampedArray(w * h * 4).fill(250)
    const signal = objectDensitySignal(rgba, w, h)
    expect(signal).toBeDefined()
    expect(signal.blobCount).toBe(0)
    expect(signal.coverFraction).toBe(0)
  })
})

