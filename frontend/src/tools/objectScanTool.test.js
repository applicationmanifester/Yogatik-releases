import { describe, it, expect, vi } from 'vitest'
import { objectScanTool } from './objectScanTool'
import * as imageStats from '../vision/imageStats'

describe('objectScanTool', () => {
  it('rejects empty url', async () => {
    const res = await objectScanTool.execute({ url: '' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('url is required')
  })

  it('handles load failures gracefully', async () => {
    vi.spyOn(imageStats, 'loadImageData').mockResolvedValueOnce(null)
    const res = await objectScanTool.execute({ url: 'data:image/png;base64,broken' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Could not load image')
  })

  it('scans an image and returns rich object layout data', async () => {
    // 20x20 dark image with a bright button
    const w = 20, h = 20
    const rgba = new Uint8ClampedArray(w * h * 4).fill(15)
    for (let y = 5; y < 10; y++) {
      for (let x = 4; x < 16; x++) {
        const i = (y * w + x) * 4
        rgba[i] = 240
        rgba[i + 1] = 240
        rgba[i + 2] = 240
        rgba[i + 3] = 255
      }
    }

    vi.spyOn(imageStats, 'loadImageData').mockResolvedValueOnce({ rgba, width: w, height: h })
    const res = await objectScanTool.execute({ url: 'data:image/png;base64,mock', minArea: 20 })

    expect(res.success).toBe(true)
    expect(res.tool).toBe('object_scan')
    expect(res.blobCount).toBeGreaterThanOrEqual(1)
    expect(res.objects[0]).toHaveProperty('box_2d')
    expect(res.objects[0]).toHaveProperty('type')
    expect(res.background).toBeDefined()
  })
})
