/**
 * Universal Image Normalizer (Computer Vision Layer)
 *
 * Pre-formats images before reaching any multimodal LLM (GPT, Gemini, Claude, Qwen-VL, LLaVA):
 * 1. Read & apply EXIF rotation metadata (stripping EXIF tags to prevent sideways photos).
 * 2. Cap dimensions safely (longest edge 1024px–1568px) to preserve detail and prevent token inflation.
 * 3. Flatten alpha channels onto neutral/white background (prevents transparent PNG black-box artifacts).
 * 4. Adaptively enhance exposure and dynamic range (rescues dark-mode UI and underexposed shots).
 * 5. Standardize to sRGB JPEG / PNG.
 */

import { adaptiveEnhanceCanvas } from './preprocess'

export const TARGET_MAX_EDGE = 1440 // Sweet spot between 1024px and 1568px
export const MIN_MAX_EDGE = 1024
export const MAX_MAX_EDGE = 1568

/**
 * Extract EXIF orientation value (1-8) from a JPEG ArrayBuffer.
 * Returns 1 (normal) if not found or not JPEG.
 */
export function getExifOrientation(buffer) {
  if (!buffer || buffer.byteLength < 14) return 1
  const view = new DataView(buffer)
  // Check JPEG SOI marker (0xFFD8)
  if (view.getUint16(0, false) !== 0xFFD8) return 1

  let offset = 2
  const length = view.byteLength

  while (offset + 4 < length) {
    const marker = view.getUint16(offset, false)
    offset += 2
    // APP1 marker (0xFFE1) contains EXIF
    if (marker === 0xFFE1) {
      offset += 2 // skip APP1 length
      if (offset + 6 > length) return 1
      // Check for 'Exif\0\0' string (0x45786966 0x0000)
      if (view.getUint32(offset, false) === 0x45786966 && view.getUint16(offset + 4, false) === 0x0000) {
        const tiffOffset = offset + 6
        if (tiffOffset + 8 > length) return 1
        const bigEndian = view.getUint16(tiffOffset, false) === 0x4D4D
        const firstIfdOffset = view.getUint32(tiffOffset + 4, !bigEndian)
        let ifdOffset = tiffOffset + firstIfdOffset

        if (ifdOffset + 2 > length) return 1
        const numEntries = view.getUint16(ifdOffset, !bigEndian)
        ifdOffset += 2

        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifdOffset + i * 12
          if (entryOffset + 12 > length) break
          const tag = view.getUint16(entryOffset, !bigEndian)
          // 0x0112 = Orientation tag
          if (tag === 0x0112) {
            return view.getUint16(entryOffset + 8, !bigEndian)
          }
        }
      }
      break
    } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
      // Skip other variable-length markers
      const markerLength = view.getUint16(offset, false)
      offset += markerLength
    } else {
      break
    }
  }
  return 1
}

/**
 * Apply EXIF orientation transform to canvas context.
 */
function applyOrientationTransform(ctx, orientation, width, height) {
  switch (orientation) {
    case 2: // Horizontal flip
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      break
    case 3: // 180° rotate
      ctx.translate(width, height)
      ctx.rotate(Math.PI)
      break
    case 4: // Vertical flip
      ctx.translate(0, height)
      ctx.scale(1, -1)
      break
    case 5: // Vertical flip + 90° rotate
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      break
    case 6: // 90° rotate CW
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -height)
      break
    case 7: // Horizontal flip + 90° rotate
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(width, -height)
      ctx.scale(-1, 1)
      break
    case 8: // 270° rotate CW (90° CCW)
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-width, 0)
      break
    default:
      break
  }
}

/**
 * Normalize an image:
 * - Caps max dimension between 1024px and 1568px
 * - Strips alpha with neutral background
 * - Applies EXIF rotation
 * - Adaptively enhances dark or low-contrast frames
 */
export async function normalizeImage(source, {
  maxEdge = TARGET_MAX_EDGE,
  quality = 0.90,
  flattenBackground = '#FFFFFF',
  enhance = true,
} = {}) {
  let img = null
  let orientation = 1
  let dataUrl = ''

  if (typeof source === 'string') {
    dataUrl = source
  } else if (source instanceof Blob || source instanceof File) {
    const arrayBuffer = await source.arrayBuffer()
    orientation = getExifOrientation(arrayBuffer)
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(source)
    })
  } else if (source && typeof source.naturalWidth === 'number') {
    img = source
  }

  if (!img) {
    img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image failed to decode'))
      el.src = dataUrl
    })
  }

  const origW = img.naturalWidth || img.width || 0
  const origH = img.naturalHeight || img.height || 0
  if (!origW || !origH) throw new Error('Image has 0 dimensions')

  // Account for orientation swapping width and height (orientations 5, 6, 7, 8)
  const isSwapped = orientation >= 5 && orientation <= 8
  const visualW = isSwapped ? origH : origW
  const visualH = isSwapped ? origW : origH

  // Clamp target maxEdge between safe limits
  const clampedMaxEdge = Math.max(MIN_MAX_EDGE, Math.min(MAX_MAX_EDGE, maxEdge))
  const scale = Math.min(1, clampedMaxEdge / Math.max(visualW, visualH))
  const targetW = Math.max(1, Math.round(visualW * scale))
  const targetH = Math.max(1, Math.round(visualH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (ctx) {
    // 1. Flatten transparency: solid background
    if (flattenBackground) {
      ctx.fillStyle = flattenBackground
      ctx.fillRect(0, 0, targetW, targetH)
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // 2. Draw with orientation correction
    ctx.save()
    if (orientation > 1) {
      applyOrientationTransform(ctx, orientation, targetW, targetH)
    }
    const drawW = isSwapped ? targetH : targetW
    const drawH = isSwapped ? targetW : targetH
    ctx.drawImage(img, 0, 0, drawW, drawH)
    ctx.restore()

    // 3. Adaptive dynamic range / tone expansion
    if (enhance) {
      adaptiveEnhanceCanvas(canvas)
    }
  }

  const normalizedDataUrl = canvas.toDataURL ? canvas.toDataURL('image/jpeg', quality) : dataUrl

  return {
    canvas,
    dataUrl: normalizedDataUrl,
    width: targetW,
    height: targetH,
    originalWidth: origW,
    originalHeight: origH,
    orientation,
    scale,
  }
}
