/**
 * A cheap fingerprint of the screen, so the companion can tell "nothing has
 * changed" from "something happened" WITHOUT paying for a vision call.
 *
 * companion/watch.js was written to gate every look on this, but the watcher
 * never produced a hash: it called shouldLook({ hash: null }), which takes the
 * "no fingerprint available" branch and always looks. The whole change-gate —
 * lastHash, diffThreshold, hammingDistance — was dead, and an idle desktop
 * spent its entire hourly budget looking at a screen that had not moved.
 *
 * Same average-hash idea as live/video.js, but over a data URL rather than a
 * <video>, and emitted as a '0'/'1' STRING because that is what watch.js's
 * hammingDistance compares (it also refuses hashes of different lengths, so the
 * edge must never change without changing DEFAULTS.diffThreshold with it).
 */

export const HASH_EDGE = 8               // 8x8 = 64 bits, matching diffThreshold 8

/** Decode a data URL to something drawable. Returns null rather than throwing. */
async function decode(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      return await createImageBitmap(blob)
    } catch { /* fall through to Image */ }
  }
  if (typeof Image !== 'function') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * @param {string} dataUrl a screenshot, as returned by desktop:captureScreen
 * @returns {Promise<string|null>} 64 characters of '0'/'1', or null when the
 *   image could not be read — null means "unknown", and watch.js then looks
 *   rather than silently going blind.
 */
export async function hashDataUrl(dataUrl) {
  const img = await decode(dataUrl)
  if (!img) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = HASH_EDGE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, HASH_EDGE, HASH_EDGE)
    const { data } = ctx.getImageData(0, 0, HASH_EDGE, HASH_EDGE)
    return hashFromRgba(data)
  } catch {
    return null
  } finally {
    if (typeof img.close === 'function') img.close()
  }
}

/**
 * The pure half — pixels in, fingerprint out — so the gating is testable
 * without a canvas.
 * @param {Uint8ClampedArray|number[]} rgba HASH_EDGE^2 pixels, 4 bytes each
 */
export function hashFromRgba(rgba) {
  const count = Math.floor(rgba.length / 4)
  if (!count) return null
  const gray = new Float64Array(count)
  let sum = 0
  for (let i = 0, p = 0; p < count; i += 4, p++) {
    gray[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000
    sum += gray[p]
  }
  const mean = sum / count
  let out = ''
  for (let p = 0; p < count; p++) out += gray[p] > mean ? '1' : '0'
  return out
}
