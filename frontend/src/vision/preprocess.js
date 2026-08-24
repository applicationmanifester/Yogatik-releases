/**
 * Making an image legible to OCR before asking OCR to read it.
 *
 * Tesseract's models are trained on scanned documents: dark text, light page,
 * roughly 300dpi, upright. A screenshot is none of those things, and the app
 * was handing it the raw frame. A dark-mode video player came back as
 * "10 » | 41 PLEY" — not because OCR is bad, but because it was shown white
 * glyphs on black at UI scale, which is the inverse of everything it knows.
 *
 * So: build a few candidate renderings, hand them to OCR in order of how
 * likely they are to work, and keep the best result by confidence. Every step
 * here is a canvas operation costing single-digit milliseconds — this is the
 * cheapest large win available in the whole vision path.
 *
 * The pixel maths is pure and exported separately so it can be tested without
 * a browser.
 */

import { luminance, lumaProfile } from './imageStats'

/** Tesseract wants text roughly 20-40px tall; UI text is often 12-16px. */
export const TARGET_MIN_EDGE = 1000
export const MAX_EDGE = 2600

// ── Pure pixel operations (in place, on an RGBA array) ──────────────────────

export function toGrayscale(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const y = luminance(rgba[i], rgba[i + 1], rgba[i + 2]) | 0
    rgba[i] = rgba[i + 1] = rgba[i + 2] = y
  }
  return rgba
}

export function invert(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255 - rgba[i]
    rgba[i + 1] = 255 - rgba[i + 1]
    rgba[i + 2] = 255 - rgba[i + 2]
  }
  return rgba
}

/**
 * Stretch the histogram so the darkest few percent become black and the
 * lightest few become white. UI screenshots are typically low-contrast greys;
 * this pulls glyph edges apart from their background.
 */
export function stretchContrast(rgba, clip = 0.02) {
  const { hist, count } = lumaProfile(rgba)
  if (!count) return rgba
  const cut = count * clip
  let lo = 0
  let hi = 255
  let acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break } }
  if (hi <= lo) return rgba
  const scale = 255 / (hi - lo)
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      rgba[i + c] = Math.max(0, Math.min(255, (rgba[i + c] - lo) * scale))
    }
  }
  return rgba
}

/**
 * Sauvola-style local thresholding over an integral image.
 *
 * A single global threshold destroys a screenshot with both a light panel and
 * a dark one — half the image becomes solid black. Local thresholding judges
 * every pixel against its own neighbourhood, which is exactly the situation a
 * UI presents.
 */
export function adaptiveThreshold(rgba, width, height, { window = 25, k = 0.2 } = {}) {
  const n = width * height
  if (!n) return rgba
  const gray = new Float64Array(n)
  for (let p = 0; p < n; p++) gray[p] = rgba[p * 4]

  // Integral images for O(1) window sums.
  const sum = new Float64Array((width + 1) * (height + 1))
  const sqsum = new Float64Array((width + 1) * (height + 1))
  const W = width + 1
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    let rowSq = 0
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x]
      rowSum += v
      rowSq += v * v
      sum[(y + 1) * W + (x + 1)] = sum[y * W + (x + 1)] + rowSum
      sqsum[(y + 1) * W + (x + 1)] = sqsum[y * W + (x + 1)] + rowSq
    }
  }
  const half = Math.max(1, Math.floor(window / 2))
  const area = (x0, y0, x1, y1, table) =>
    table[y1 * W + x1] - table[y0 * W + x1] - table[y1 * W + x0] + table[y0 * W + x0]

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const count = (x1 - x0) * (y1 - y0)
      const s = area(x0, y0, x1, y1, sum)
      const sq = area(x0, y0, x1, y1, sqsum)
      const mean = s / count
      const variance = Math.max(0, sq / count - mean * mean)
      const std = Math.sqrt(variance)
      const threshold = mean * (1 + k * (std / 128 - 1))
      const p = y * width + x
      const v = gray[p] > threshold ? 255 : 0
      rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = v
    }
  }
  return rgba
}

// ── Canvas rendering ────────────────────────────────────────────────────────

function canvasFrom(rgba, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return canvas
}

/** Draw at a new size with smoothing — upscaling is what gives OCR glyphs to work with. */
function rescale(canvas, scale) {
  if (scale === 1) return canvas
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(canvas.width * scale))
  out.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

/**
 * Candidate renderings, best guess first.
 *
 * @param {{rgba, width, height}} img  from imageStats.loadImageData
 * @param {object} analysis            from imageStats.classifyImage
 * @returns {Array<{name, dataUrl, note}>}
 */
export function buildOcrVariants(img, analysis = {}) {
  if (typeof document === 'undefined') return []
  const { width, height } = img
  const variants = []

  // Upscale small images so glyphs reach a height Tesseract was trained on.
  const minEdge = Math.min(width, height)
  const scale = minEdge < TARGET_MIN_EDGE
    ? Math.min(3, TARGET_MIN_EDGE / minEdge, MAX_EDGE / Math.max(width, height))
    : 1

  const push = (name, rgba, note) => {
    try {
      const base = canvasFrom(rgba, width, height)
      variants.push({ name, dataUrl: rescale(base, scale).toDataURL('image/png'), note })
    } catch { /* a tainted or oversized canvas simply yields one fewer variant */ }
  }

  // 1. Grayscale + contrast. Cheap, and enough for most light UI.
  const a = new Uint8ClampedArray(img.rgba)
  stretchContrast(toGrayscale(a))
  push('gray+contrast', a, `grayscale, contrast-stretched, ${scale.toFixed(1)}x`)

  // 2. Inverted, for light-on-dark. This is THE fix for the dark-mode
  // screenshot that produced "10 » | 41 PLEY": Tesseract expects dark ink.
  if (analysis.darkMode) {
    const b = new Uint8ClampedArray(img.rgba)
    stretchContrast(invert(toGrayscale(b)))
    // Inverted goes FIRST when the image is dark — it is not a fallback there,
    // it is the correct rendering.
    variants.unshift({
      name: 'inverted',
      dataUrl: rescale(canvasFrom(b, width, height), scale).toDataURL('image/png'),
      note: `inverted (dark theme), contrast-stretched, ${scale.toFixed(1)}x`,
    })
  }

  // 3. Binarised. Best on noisy or low-contrast captures, worst on photos.
  if (analysis.kind !== 'photo') {
    const c = new Uint8ClampedArray(img.rgba)
    toGrayscale(c)
    if (analysis.darkMode) invert(c)
    stretchContrast(c)
    adaptiveThreshold(c, width, height)
    push('binarised', c, 'locally thresholded (Sauvola)')
  }

  return variants
}
