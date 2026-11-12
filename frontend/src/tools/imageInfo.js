// Image metadata extraction using Canvas + EXIF
export const imageInfoTool = {
  schema: {
    description: 'Get image dimensions, size, and basic metadata',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Image URL or data URL' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    if (typeof url !== 'string' || !url.trim()) return { success: false, error: 'url is required' }
    const img = new Image(); img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const resp = await fetch(url)
    const blob = await resp.blob()
    return {
      success: true, tool: 'image_info',
      width: img.naturalWidth, height: img.naturalHeight,
      aspectRatio: `${img.naturalWidth}:${img.naturalHeight}`,
      size: `${(blob.size / 1024).toFixed(1)} KB`,
      type: blob.type,
    }
  }
}

// ── Enhanced helpers appended ──────────────────────────────────────────────

async function loadImage(url, maxEdge) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        resolve({ rgba: data, width: w, height: h })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function estimateBlobSize(url) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return `${(blob.size / 1024).toFixed(1)} KB`
  } catch {
    return 'unknown'
  }
}

function luminanceProfile(rgba) {
  const hist = new Uint32Array(256)
  let sum = 0
  const n = Math.floor(rgba.length / 4)
  if (!n) return { mean: 0, dark: 0, light: 0 }
  for (let i = 0; i < n; i += 4) {
    const y = ((rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000) | 0
    hist[y]++
    sum += y
  }
  let dark = 0, light = 0
  for (let v = 0; v < 48; v++) dark += hist[v]
  for (let v = 208; v < 256; v++) light += hist[v]
  return { mean: sum / n, dark: dark / n, light: light / n }
}

function luminance(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000
}

function quantizedColourCount(rgba, cap = 4096) {
  const seen = new Set()
  const n = Math.floor(rgba.length / 4)
  const stride = Math.max(1, Math.floor(n / 20000))
  for (let p = 0; p < n; p += stride) {
    const i = p * 4
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)
    seen.add(key)
    if (seen.size >= cap) break
  }
  return seen.size
}

function dominantColours(rgba, top = 6) {
  const buckets = new Map()
  const n = Math.floor(rgba.length / 4)
  const stride = Math.max(1, Math.floor(n / 30000))
  for (let p = 0; p < n; p += stride) {
    const i = p * 4
    const r = rgba[i] >> 4
    const g = rgba[i + 1] >> 4
    const b = rgba[i + 2] >> 4
    const key = `${r},${g},${b}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1
  return sorted.map(([key, count]) => {
    const [r, g, b] = key.split(',').map(Number)
    const hex = '#' + [r << 4 | r >> 4, g << 4 | g >> 4, b << 4 | b >> 4].map(v => v.toString(16).padStart(2, '0')).join('')
    return { hex, share: Math.round((count / total) * 1000) / 1000 }
  })
}

function classifyFromStats(colors, edges, luma) {
  if (colors < 50 && edges > 0.15) return 'line_art_or_icon'
  if (colors < 400 && luma.light > 0.55 && edges > 0.06) return 'document_or_ui'
  if (colors < 900 && luma.dark > 0.6 && edges > 0.05) return 'dark_ui'
  if (colors < 600 && edges <= 0.08) return 'diagram_or_chart'
  if (colors > 1500) return 'photograph'
  return 'unknown'
}