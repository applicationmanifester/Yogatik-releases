// Connected-component object scanning — pure pixel maths, no model, no network.
// Detects distinct blobs, bounding boxes, and rough object counts from RGBA data.
// Useful as a fast pre-filter before sending an image to a VLM or OCR.

/**
 * Flood-fill connected components on a binarised luminance mask.
 * Returns blobs with bbox, area, centroid, and mean colour.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @param {{minArea?: number, maxBlobs?: number}} opts
 * @returns {{blobs: Array<{id:number, x:number, y:number, w:number, h:number, area:number, cx:number, cy:number, meanLuma:number}>, count:number}}
 */
export function connectedComponents(rgba, width, height, { minArea = 40, maxBlobs = 200 } = {}) {
  const n = width * height
  const visited = new Uint8Array(n)
  const lum = new Uint8Array(n)

  // Build a luminance mask: bright = foreground (>200), dark = background.
  // Inverted if the image is mostly dark (so text/UI on dark themes still shows).
  let brightSum = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    lum[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000 | 0
    brightSum += lum[p]
  }
  const meanLuma = brightSum / n
  const isForeground = meanLuma > 128 ? v => v > 200 : v => v < 60

  const blobs = []
  const dirs = [-1, 1, -width, width] // 4-connectivity

  for (let start = 0; start < n && blobs.length < maxBlobs; start++) {
    if (visited[start] || !isForeground(lum[start])) continue

    // BFS flood fill
    const queue = [start]
    visited[start] = 1
    let minX = width, minY = height, maxX = 0, maxY = 0
    let area = 0, lumaSum = 0

    while (queue.length) {
      const p = queue.pop()
      const x = p % width
      const y = (p / width) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      area++
      lumaSum += lum[p]

      for (const d of dirs) {
        const np = p + d
        // Don't wrap across row boundaries for horizontal moves
        if (d === -1 && x === 0) continue
        if (d === 1 && x === width - 1) continue
        if (np < 0 || np >= n) continue
        if (visited[np]) continue
        if (!isForeground(lum[np])) continue
        visited[np] = 1
        queue.push(np)
      }
    }

    if (area >= minArea) {
      blobs.push({
        id: blobs.length + 1,
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        area,
        cx: Math.round((minX + maxX) / 2),
        cy: Math.round((minY + maxY) / 2),
        meanLuma: Math.round((lumaSum / area) * 10) / 10,
      })
    }
  }

  // Sort by area descending — biggest objects first
  blobs.sort((a, b) => b.area - a.area)

  return { blobs, count: blobs.length }
}

/**
 * Quick object-density signal: how many distinct foreground blobs, and what
 * fraction of the image they cover. A UI screenshot has many small blobs;
 * a photograph has few large ones or a smooth gradient.
 */
export function objectDensitySignal(rgba, width, height) {
  const { blobs, count } = connectedComponents(rgba, width, height, { minArea: 100, maxBlobs: 500 })
  const totalPixels = width * height
  const covered = blobs.reduce((s, b) => s + b.area, 0)
  return {
    blobCount: count,
    coverFraction: totalPixels ? Math.round((covered / totalPixels) * 1000) / 1000 : 0,
    largestBlobArea: blobs[0]?.area ?? 0,
    avgBlobSize: count ? Math.round(covered / count) : 0,
    topBlobs: blobs.slice(0, 8).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, area: b.area })),
  }
}