/**
 * Guards for the inference downscale added to vision/detect.js.
 *
 * The DETR/CLIP path used to receive a full 768px live frame on every tick;
 * INTERNAL_TECH_DEBT P0 #3 asked for a 320px cap. These tests pin the geometry
 * and — critically — the guarantee that the helper is SAFE: it must never throw
 * and must hand back anything it cannot decode, so a working detection call can
 * never be broken by it.
 */
import { describe, it, expect } from 'vitest'
import {
  fitInferenceDimensions,
  downscaleForInference,
  summariseDetections,
  INFERENCE_MAX_EDGE,
} from './detect'

describe('fitInferenceDimensions', () => {
  it('leaves an already-small image untouched', () => {
    expect(fitInferenceDimensions(320, 240)).toEqual({ width: 320, height: 240, scaled: false })
    expect(fitInferenceDimensions(100, 80)).toEqual({ width: 100, height: 80, scaled: false })
  })

  it('caps the long edge at maxEdge for a landscape frame', () => {
    const r = fitInferenceDimensions(768, 576)
    expect(r.scaled).toBe(true)
    expect(r.width).toBe(320)
    expect(Math.abs(r.height - 240)).toBeLessThanOrEqual(1)
    expect(Math.max(r.width, r.height)).toBe(320)
  })

  it('caps the long edge for a portrait frame', () => {
    const r = fitInferenceDimensions(480, 640)
    expect(r.height).toBe(320)
    expect(r.width).toBe(240)
  })

  it('always returns even dimensions (JPEG chroma subsampling)', () => {
    const r = fitInferenceDimensions(1001, 777)
    expect(r.width % 2).toBe(0)
    expect(r.height % 2).toBe(0)
  })

  it('never collapses an extreme aspect ratio to zero height', () => {
    const r = fitInferenceDimensions(4000, 3)
    expect(r.width).toBeLessThanOrEqual(320)
    expect(r.height).toBeGreaterThanOrEqual(2)
  })

  it('returns a zero box for degenerate input rather than NaN', () => {
    expect(fitInferenceDimensions(0, 0)).toEqual({ width: 0, height: 0, scaled: false })
    expect(fitInferenceDimensions(-5, 10)).toEqual({ width: 0, height: 0, scaled: false })
  })

  it('honours a custom maxEdge', () => {
    const r = fitInferenceDimensions(1000, 500, 100)
    expect(r.width).toBe(100)
    expect(r.height).toBe(50)
  })

  it('exports a sane default edge', () => {
    expect(INFERENCE_MAX_EDGE).toBe(320)
  })
})

describe('downscaleForInference', () => {
  it('passes through non-image values untouched', async () => {
    const raw = { rawImage: true }
    expect(await downscaleForInference(raw)).toBe(raw)
    expect(await downscaleForInference(null)).toBe(null)
    expect(await downscaleForInference(123)).toBe(123)
  })

  it('passes through strings that are not loadable image URLs', async () => {
    expect(await downscaleForInference('not-a-url')).toBe('not-a-url')
    expect(await downscaleForInference('')).toBe('')
  })

  it('never throws on junk input', async () => {
    await expect(downscaleForInference([1, 2, 3])).resolves.toEqual([1, 2, 3])
    await expect(downscaleForInference(true)).resolves.toBe(true)
  })
})

describe('summariseDetections', () => {
  it('reads like a person would say it', () => {
    expect(summariseDetections([
      { label: 'person' }, { label: 'person' }, { label: 'laptop' },
    ])).toBe('2 persons, a laptop')
  })

  it('is empty for no detections', () => {
    expect(summariseDetections([])).toBe('')
  })
})
