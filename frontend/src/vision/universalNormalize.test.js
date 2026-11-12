import { describe, it, expect } from 'vitest'
import { getExifOrientation, TARGET_MAX_EDGE, MIN_MAX_EDGE, MAX_MAX_EDGE } from './universalNormalize'

describe('universalNormalize', () => {
  it('parses EXIF orientation from JPEG buffer', () => {
    // Construct minimal valid JPEG APP1 EXIF buffer with orientation 6 (90° CW)
    // SOI: 0xFF, 0xD8
    // APP1: 0xFF, 0xE1, len(2), 'Exif\0\0', TIFF header (II, 0x002A, offset 8), 1 IFD entry: tag 0x0112 (type 3, count 1, val 6)
    const buf = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE1, 0x00, 0x22, // len 34
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // 'Exif\0\0'
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF little-endian, offset 8
      0x01, 0x00, // 1 entry
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Tag 0x0112, type SHORT, count 1, value 6
      0x00, 0x00, 0x00, 0x00,
    ])

    const orientation = getExifOrientation(buf.buffer)
    expect(orientation).toBe(6)
  })

  it('returns 1 for non-JPEG or missing EXIF', () => {
    const pngBuf = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
    expect(getExifOrientation(pngBuf.buffer)).toBe(1)
    expect(getExifOrientation(null)).toBe(1)
  })

  it('maintains safe dimensions bounds', () => {
    expect(TARGET_MAX_EDGE).toBeGreaterThanOrEqual(MIN_MAX_EDGE)
    expect(TARGET_MAX_EDGE).toBeLessThanOrEqual(MAX_MAX_EDGE)
    expect(MIN_MAX_EDGE).toBe(1024)
    expect(MAX_MAX_EDGE).toBe(1568)
  })
})

