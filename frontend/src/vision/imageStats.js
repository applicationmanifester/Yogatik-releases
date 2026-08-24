/**
 * What KIND of image is this, decided from the pixels alone.
 *
 * No download, no model, no network — this runs in a few milliseconds on a
 * canvas and it is the difference between handing a language model
 * "10 » | 41 PLEY" and handing it "a dark 16:9 UI screenshot, almost certainly
 * a video player, with a text band across the bottom".
 *
 * The measured failure this exists for: a screenshot of a video player was fed
 * straight to Tesseract at its native scale with no preprocessing. Tesseract is
 * trained on dark-text-on-light documents, so white-on-black UI chrome came
 * back as a nonsense fragment, and that fragment was passed to the model AS IF
 * IT WERE THE CONTENT OF THE IMAGE. The model then correctly said it could not
 * identify anything — the pipeline had thrown the picture away.
 *
 * Everything here is pure maths over an RGBA array, so it is testable with no
 * browser: loadImageData() is the only DOM-touching function.
 */

// ── Pure analysis ───────────────────────────────────────────────────────────

/** Relative luminance, the same weighting screenHash and every codec uses. */
export function luminance(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000
}

/**
 * Histogram, mean, and the share of pixels that are very dark or very light.
 * @param {Uint8ClampedArray} rgba
 */
export function lumaProfile(rgba) {
  const hist = new Uint32Array(256)
  const n = Math.floor(rgba.length / 4)
  if (!n) return { hist, mean: 0, dark: 0, light: 0, count: 0 }
  let sum = 0
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const y = luminance(rgba[i], rgba[i + 1], rgba[i + 2]) | 0
    hist[y]++
    sum += y
  }
  let dark = 0
  let light = 0
  for (let v = 0; v < 48; v++) dark += hist[v]
  for (let v = 208; v < 256; v++) light += hist[v]
  return { hist, mean: sum / n, dark: dark / n, light: light / n, count: n }
}

/**
 * How many DISTINCT colours, quantised to a 5-bit-per-channel cube.
 *
 * This is the single most useful discriminator in the whole file. A photograph
 * has thousands of distinct colours; a user interface has dozens, because it is
 * drawn from a palette. Getting this one number right is most of the
 * classification.
 */
export function colourCount(rgba, cap = 4096) {
  const seen = new Set()
  const n = Math.floor(rgba.length / 4)
  // Sampling: a full 4K frame is 8M pixels and the answer stabilises long
  // before that. Stride keeps this ~1ms rather than ~200ms.
  const stride = Math.max(1, Math.floor(n / 20000))
  for (let p = 0; p < n; p += stride) {
    const i = p * 4
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)
    seen.add(key)
    if (seen.size >= cap) break
  }
  return seen.size
}

/**
 * Fraction of pixels sitting on a strong horizontal or vertical edge.
 * Text and UI chrome are full of hard edges; a photograph is mostly gradient.
 */
export function edgeDensity(rgba, width, height, threshold = 40) {
  if (width < 3 || height < 3) return 0
  let edges = 0
  let tested = 0
  const at = (x, y) => {
    const i = (y * width + x) * 4
    return luminance(rgba[i], rgba[i + 1], rgba[i + 2])
  }
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200))
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const c = at(x, y)
      if (Math.abs(c - at(x + 1, y)) > threshold || Math.abs(c - at(x, y + 1)) > threshold) edges++
      tested++
    }
  }
  return tested ? edges / tested : 0
}

/**
 * Rows whose ink differs sharply from the page — where the text bands are.
 * A horizontal projection profile is the classic, cheap way to find them, and
 * it works on light-on-dark just as well as dark-on-light because it looks at
 * DISTANCE from the row's own background, not at absolute darkness.
 *
 * @returns {Array<{top:number, bottom:number, density:number}>} bands, top-down
 */
export function textBands(rgba, width, height, { minRows = 4, gap = 3 } = {}) {
  if (width < 8 || height < 8) return []
  const rowInk = new Float64Array(height)
  const step = Math.max(1, Math.floor(width / 400))
  for (let y = 0; y < height; y++) {
    // The row's own median-ish background: the mean is close enough and far
    // cheaper, and text is a minority of any row's pixels.
    let sum = 0
    let seen = 0
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      sum += luminance(rgba[i], rgba[i + 1], rgba[i + 2])
      seen++
    }
    const mean = sum / (seen || 1)
    let diff = 0
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (Math.abs(luminance(rgba[i], rgba[i + 1], rgba[i + 2]) - mean) > 45) diff++
    }
    rowInk[y] = diff / (seen || 1)
  }

  const active = []
  const threshold = 0.02
  let start = -1
  let quiet = 0
  for (let y = 0; y < height; y++) {
    if (rowInk[y] > threshold) {
      if (start === -1) start = y
      quiet = 0
    } else if (start !== -1) {
      // Tolerate a few blank rows so the gaps between glyph rows in one
      // paragraph do not split it into a band per line.
      if (++quiet > gap) {
        if (y - quiet - start >= minRows) active.push({ top: start, bottom: y - quiet })
        start = -1
        quiet = 0
      }
    }
  }
  if (start !== -1 && height - start >= minRows) active.push({ top: start, bottom: height })

  return active.map(b => {
    let ink = 0
    for (let y = b.top; y < b.bottom; y++) ink += rowInk[y]
    return { ...b, density: ink / Math.max(1, b.bottom - b.top) }
  })
}

/** The handful of colours the image is actually made of. */
export function dominantColours(rgba, top = 5) {
  const buckets = new Map()
  const n = Math.floor(rgba.length / 4)
  const stride = Math.max(1, Math.floor(n / 20000))
  for (let p = 0; p < n; p += stride) {
    const i = p * 4
    const key = `${rgba[i] >> 4},${rgba[i + 1] >> 4},${rgba[i + 2] >> 4}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const total = [...buckets.values()].reduce((a, b) => a + b, 0) || 1
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, count]) => {
      const [r, g, b] = key.split(',').map(v => (Number(v) << 4) + 8)
      return { rgb: [r, g, b], hex: `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`, share: count / total }
    })
}

/**
 * Put it together into a verdict.
 *
 * @returns {{kind, darkMode, confidence, reasons, ...}} `kind` is one of
 *   'photo' | 'ui' | 'document' | 'diagram' | 'unknown'
 */
export function classifyImage({ rgba, width, height }) {
  const luma = lumaProfile(rgba)
  const colours = colourCount(rgba)
  const edges = edgeDensity(rgba, width, height)
  const bands = textBands(rgba, width, height)
  const darkMode = luma.mean < 110 && luma.dark > 0.35
  const aspect = width / Math.max(1, height)
  const reasons = []

  let kind = 'unknown'
  let confidence = 0.4

  // A document is overwhelmingly one background colour with dark ink on it.
  if (colours < 400 && luma.light > 0.55 && bands.length >= 3) {
    kind = 'document'
    confidence = 0.8
    reasons.push(`${bands.length} text bands on a light, near-uniform background`)
  } else if (darkMode && colours < 900) {
    // A dark image drawn from a small palette is a dark-themed interface,
    // essentially always. Diagrams and charts are drawn on light grounds; a
    // photograph has thousands of colours even at night. Reaching this via the
    // edge-density branch alone mislabelled a video player — mostly flat dark
    // pixels with one band of chrome — as "a diagram, chart or illustration",
    // which sends the model looking for the wrong thing entirely.
    kind = 'ui'
    confidence = 0.75
    reasons.push(`dark, drawn from only ~${colours} colours — a dark-themed interface`)
    if (bands.length) reasons.push(`${bands.length} text band${bands.length === 1 ? '' : 's'}`)
  } else if (colours < 900 && edges > 0.08) {
    // Few colours plus hard edges is a drawn interface, not a captured scene.
    kind = 'ui'
    confidence = colours < 400 ? 0.85 : 0.7
    reasons.push(`only ~${colours} distinct colours with a high edge density (${edges.toFixed(2)}) — drawn, not photographed`)
    if (darkMode) reasons.push('dark theme')
  } else if (colours < 600 && edges <= 0.08) {
    kind = 'diagram'
    confidence = 0.6
    reasons.push('flat colour areas with clean boundaries')
  } else if (colours > 1500) {
    kind = 'photo'
    confidence = 0.85
    reasons.push(`${colours}+ distinct colours and soft gradients`)
  }

  return {
    kind,
    confidence,
    darkMode,
    width,
    height,
    aspect: Number(aspect.toFixed(3)),
    colours,
    edgeDensity: Number(edges.toFixed(3)),
    meanLuma: Math.round(luma.mean),
    textBands: bands.length,
    bands,
    dominant: dominantColours(rgba),
    reasons,
  }
}

/**
 * A sentence a language model can actually use, instead of a pile of numbers.
 * This is what reaches a text-only model, so it has to carry the shape of the
 * picture in words.
 */
export function describeStructure(a) {
  if (!a) return ''
  const parts = []
  const shape = a.aspect > 1.6 ? 'wide 16:9-ish' : a.aspect < 0.8 ? 'tall/portrait' : 'roughly square'
  const KINDS = {
    ui: 'a screenshot of a user interface',
    document: 'a document or page of text',
    photo: 'a photograph',
    diagram: 'a diagram, chart or illustration',
    unknown: 'an image',
  }
  parts.push(`${a.width}x${a.height} (${shape}), most likely ${KINDS[a.kind] || KINDS.unknown}`)
  if (a.darkMode) parts.push('dark theme (light text on a dark background)')
  if (a.textBands) parts.push(`${a.textBands} horizontal text region${a.textBands === 1 ? '' : 's'}`)
  if (a.dominant?.length) parts.push(`dominant colours ${a.dominant.slice(0, 3).map(d => d.hex).join(', ')}`)
  if (a.reasons?.length) parts.push(`(${a.reasons.join('; ')})`)
  return parts.join('; ')
}

// ── The one DOM-touching helper ─────────────────────────────────────────────

/** Decode a data URL / URL to raw pixels. Returns null rather than throwing. */
export async function loadImageData(src, maxEdge = 1400) {
  if (typeof document === 'undefined' || typeof Image !== 'function') return null
  const img = await new Promise((resolve) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = src
  })
  if (!img) return null
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, width, height)
  try {
    const { data } = ctx.getImageData(0, 0, width, height)
    return { rgba: data, width, height, canvas }
  } catch {
    // A cross-origin image taints the canvas; getImageData then throws and the
    // whole analysis has to be skipped rather than crashing the turn.
    return null
  }
}

/** Analyse an image URL end to end. Null when it could not be read. */
export async function analyseImage(src) {
  const loaded = await loadImageData(src)
  if (!loaded) return null
  return classifyImage(loaded)
}
