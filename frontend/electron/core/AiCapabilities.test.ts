import { describe, it, expect } from 'vitest'
import {
  tuneOllamaNumGpuLayers,
  tuneOllamaNumThread,
  tuneComfyLimits,
  tuneRendererHeapMb,
} from './AiCapabilities'

const GB = 1024 * 1024 * 1024

describe('tuneOllamaNumGpuLayers', () => {
  it('returns 0 for null/zero VRAM (CPU-only)', () => {
    expect(tuneOllamaNumGpuLayers(null)).toBe(0)
    expect(tuneOllamaNumGpuLayers(0)).toBe(0)
  })

  it('returns 0 when VRAM too small to matter (<1.5GB usable)', () => {
    expect(tuneOllamaNumGpuLayers(1 * GB)).toBe(0)
  })

  it('offloads more layers as VRAM grows (below the cap)', () => {
    const small = tuneOllamaNumGpuLayers(4 * GB)
    const mid = tuneOllamaNumGpuLayers(6 * GB)
    expect(small).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(small)
  })

  it('caps at 32 layers', () => {
    // Both sizes are far past the cap, so both return 32.
    expect(tuneOllamaNumGpuLayers(24 * GB)).toBe(32)
    expect(tuneOllamaNumGpuLayers(256 * GB)).toBe(32)
  })

  it('uses a conservative 70% of estimated VRAM', () => {
    // 4.5GB model / 32 layers ≈ 140MB per layer.
    // 70% of 8GB = 5.6GB usable → floor(5.6/4.5 * 32) = 39 → capped 32? No:
    // 5.6GB / 4.5GB = 1.244 * 32 = 39 → capped at 32.
    // Pick a size where the cap does not mask the ratio: 6GB → 70% = 4.2GB
    // → floor(4.2/4.5 * 32) = 29 layers.
    expect(tuneOllamaNumGpuLayers(6 * GB)).toBe(29)
  })
})

describe('tuneOllamaNumThread', () => {
  it('estimates physical cores as half the logical count', () => {
    expect(tuneOllamaNumThread(16)).toBe(8)
    expect(tuneOllamaNumThread(8)).toBe(4)
  })

  it('clamps to at least 1', () => {
    expect(tuneOllamaNumThread(1)).toBe(1)
    expect(tuneOllamaNumThread(0)).toBe(1)
  })

  it('caps at 16', () => {
    expect(tuneOllamaNumThread(64)).toBe(16)
  })
})

describe('tuneComfyLimits', () => {
  it('is conservative with no VRAM (CPU-only)', () => {
    expect(tuneComfyLimits(null)).toEqual({ maxResolution: 512, maxSteps: 20 })
  })

  it('scales resolution and steps with VRAM', () => {
    expect(tuneComfyLimits(2 * GB).maxResolution).toBe(512)
    expect(tuneComfyLimits(4 * GB).maxResolution).toBe(1024)
    expect(tuneComfyLimits(8 * GB).maxResolution).toBe(1536)
    expect(tuneComfyLimits(16 * GB).maxResolution).toBe(2048)
    expect(tuneComfyLimits(16 * GB).maxSteps).toBe(40)
  })
})

describe('tuneRendererHeapMb', () => {
  it('scales proportionally to RAM (25%)', () => {
    expect(tuneRendererHeapMb(8 * GB)).toBe(Math.floor(8 * GB * 0.25 / (1024 * 1024)))
  })

  it('clamps to at least 512MB (small machine)', () => {
    expect(tuneRendererHeapMb(1 * GB)).toBe(512)
  })

  it('caps at 16384MB (large machine)', () => {
    expect(tuneRendererHeapMb(128 * GB)).toBe(16384)
  })

  it('never returns the old unconditional 8192 on a 4GB machine', () => {
    // The old code set --max-old-space-size=8192 unconditionally; on a 4GB
    // machine that made the OS swap. 25% of 4GB = 1024MB.
    expect(tuneRendererHeapMb(4 * GB)).toBe(1024)
    expect(tuneRendererHeapMb(4 * GB)).toBeLessThan(8192)
  })
})