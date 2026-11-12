// Connected-component object scanning & semantic layout analysis — pure pixel maths, no model, no network.
// Detects distinct foreground blobs, bounding boxes, normalized coordinates, object types, and colors.
// Highly optimized as a fast pre-filter before sending an image to a VLM or OCR.

/**
 * Estimate dominant background from border pixels and histogram mode.
 * Border pixels are the most reliable indicator of page / canvas / UI background.
 */
function estimateBackground(rgba, width, height) {
  const n = width * height
  if (!n) return { bgLuma: 255, bgR: 255, bgG: 255, bgB: 255, contrastSpread: 30 }

  let borderR = 0, borderG = 0, borderB = 0, borderCount = 0
  const samplePixel = (x, y) => {
    const idx = (y * width + x) * 4
    borderR += rgba[idx]
    borderG += rgba[idx + 1]
    borderB += rgba[idx + 2]
    borderCount++
  }

  // Sample top and bottom rows
  const stepX = Math.max(1, Math.floor(width / 50))
  for (let x = 0; x < width; x += stepX) {
    samplePixel(x, 0)
    samplePixel(x, height - 1)
  }
  // Sample left and right columns
  const stepY = Math.max(1, Math.floor(height / 50))
  for (let y = 1; y < height - 1; y += stepY) {
    samplePixel(0, y)
    samplePixel(width - 1, y)
  }

  const bgR = borderCount ? Math.round(borderR / borderCount) : 255
  const bgG = borderCount ? Math.round(borderG / borderCount) : 255
  const bgB = borderCount ? Math.round(borderB / borderCount) : 255
  const bgLuma = Math.round((bgR * 299 + bgG * 587 + bgB * 114) / 1000)

  return { bgLuma, bgR, bgG, bgB, contrastSpread: 35 }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * Flood-fill connected components with adaptive foreground segmentation.
 * Automatically handles dark mode, light mode, colored UI elements, diagrams, and photos.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @param {{minArea?: number, maxBlobs?: number}} opts
 * @returns {{blobs: Array<{id:number, x:number, y:number, w:number, h:number, area:number, cx:number, cy:number, meanLuma:number, aspectRatio:number, density:number, box_2d:number[], type:string, dominantColor:object}>, count:number, background:object}}
 */
export function connectedComponents(rgba, width, height, { minArea = 40, maxBlobs = 200 } = {}) {
  const n = width * height
  if (!n) return { blobs: [], count: 0, background: { bgLuma: 0, hex: '#000000' } }

  const visited = new Uint8Array(n)
  const lum = new Uint8Array(n)

  const bg = estimateBackground(rgba, width, height)
  const bgLuma = bg.bgLuma
  const bgR = bg.bgR
  const bgG = bg.bgG
  const bgB = bg.bgB

  const minLumaDelta = 22
  const minColorDelta = 48

  // Precompute luminance and foreground mask
  for (let p = 0; p < n; p++) {
    const i = p * 4
    lum[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000 | 0
  }

  const isForeground = (p) => {
    const lDiff = Math.abs(lum[p] - bgLuma)
    if (lDiff >= minLumaDelta) return true
    const i = p * 4
    const cDiff = Math.abs(rgba[i] - bgR) + Math.abs(rgba[i + 1] - bgG) + Math.abs(rgba[i + 2] - bgB)
    return cDiff >= minColorDelta
  }

  const blobs = []
  const dirs = [-1, 1, -width, width] // 4-connectivity

  for (let start = 0; start < n && blobs.length < maxBlobs; start++) {
    if (visited[start] || !isForeground(start)) continue

    // BFS flood fill
    const queue = [start]
    visited[start] = 1
    let minX = width, minY = height, maxX = 0, maxY = 0
    let area = 0, lumaSum = 0, rSum = 0, gSum = 0, bSum = 0

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

      const pi = p * 4
      rSum += rgba[pi]
      gSum += rgba[pi + 1]
      bSum += rgba[pi + 2]

      for (const d of dirs) {
        const np = p + d
        // Prevent wrap-around horizontally
        if (d === -1 && x === 0) continue
        if (d === 1 && x === width - 1) continue
        if (np < 0 || np >= n) continue
        if (visited[np]) continue
        if (!isForeground(np)) continue
        visited[np] = 1
        queue.push(np)
      }
    }

    if (area >= minArea) {
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      const cx = Math.round((minX + maxX) / 2)
      const cy = Math.round((minY + maxY) / 2)
      const bboxArea = w * h
      const density = Math.round((area / bboxArea) * 100) / 100
      const aspectRatio = Math.round((w / Math.max(1, h)) * 100) / 100

      // Normalized coordinates [ymin, xmin, ymax, xmax] scaled to 0..1000
      const ymin = Math.round((minY / height) * 1000)
      const xmin = Math.round((minX / width) * 1000)
      const ymax = Math.round((maxY / height) * 1000)
      const xmax = Math.round((maxX / width) * 1000)

      const avgR = Math.round(rSum / area)
      const avgG = Math.round(gSum / area)
      const avgB = Math.round(bSum / area)

      // Heuristic object classification
      let type = 'object_or_figure'
      if (density < 0.35 && (aspectRatio >= 2.5 || aspectRatio <= 0.4)) {
        type = 'text_line'
      } else if (density < 0.45 && area < 600) {
        type = 'text_or_symbol'
      } else if (density >= 0.55 && aspectRatio >= 1.2 && aspectRatio <= 6.0 && area < Math.max(15000, n * 0.28)) {
        type = 'button_or_pill'
      } else if (density >= 0.55 && aspectRatio >= 0.75 && aspectRatio <= 1.35 && area < Math.max(5000, n * 0.10)) {
        type = 'icon_or_avatar'
      } else if (density >= 0.45 && area >= (n * 0.08)) {
        type = 'container_or_card'
      }

      blobs.push({
        id: blobs.length + 1,
        x: minX,
        y: minY,
        w,
        h,
        area,
        cx,
        cy,
        meanLuma: Math.round((lumaSum / area) * 10) / 10,
        aspectRatio,
        density,
        type,
        box_2d: [ymin, xmin, ymax, xmax],
        dominantColor: { r: avgR, g: avgG, b: avgB, hex: rgbToHex(avgR, avgG, avgB) },
      })
    }
  }

  // Sort by area descending — biggest objects first
  blobs.sort((a, b) => b.area - a.area)

  // Identify containment / nesting: smaller blobs fully enclosed within container blobs
  for (let i = 0; i < blobs.length; i++) {
    const parent = blobs[i]
    if (parent.type !== 'container_or_card') continue
    for (let j = i + 1; j < blobs.length; j++) {
      const child = blobs[j]
      if (child.x >= parent.x && child.x + child.w <= parent.x + parent.w &&
          child.y >= parent.y && child.y + child.h <= parent.y + parent.h) {
        child.parentId = parent.id
        parent.childrenCount = (parent.childrenCount || 0) + 1
      }
    }
  }

  return {
    blobs,
    count: blobs.length,
    background: {
      bgLuma,
      dominantColor: { r: bgR, g: bgG, b: bgB, hex: rgbToHex(bgR, bgG, bgB) },
      isDarkTheme: bgLuma < 120,
    },
  }
}

/**
 * Quick object-density signal: how many distinct foreground blobs, and what
 * fraction of the image they cover. A UI screenshot has many small blobs;
 * a photograph has few large ones or a smooth gradient.
 */
export function objectDensitySignal(rgba, width, height) {
  const { blobs, count, background } = connectedComponents(rgba, width, height, { minArea: 80, maxBlobs: 500 })
  const totalPixels = width * height
  const covered = blobs.reduce((s, b) => s + b.area, 0)

  // Infer layout pattern
  let layoutPattern = 'single_subject'
  const containers = blobs.filter(b => b.type === 'container_or_card').length
  const textLines = blobs.filter(b => b.type === 'text_line' || b.type === 'text_or_symbol').length
  const buttons = blobs.filter(b => b.type === 'button_or_pill' || b.type === 'icon_or_avatar').length

  if (containers >= 2) {
    layoutPattern = 'dashboard_or_cards'
  } else if (textLines >= 4) {
    layoutPattern = 'document_or_form'
  } else if (buttons >= 3 && count >= 5) {
    layoutPattern = 'interactive_ui'
  } else if (count > 15) {
    layoutPattern = 'complex_diagram_or_grid'
  }

  return {
    blobCount: count,
    coverFraction: totalPixels ? Math.round((covered / totalPixels) * 1000) / 1000 : 0,
    largestBlobArea: blobs[0]?.area ?? 0,
    avgBlobSize: count ? Math.round(covered / count) : 0,
    layoutPattern,
    background,
    topBlobs: blobs.slice(0, 10).map(b => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      area: b.area,
      aspectRatio: b.aspectRatio,
      box_2d: b.box_2d,
      dominantColor: b.dominantColor?.hex,
      parentId: b.parentId,
    })),
  }
}
