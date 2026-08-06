// Canvas-based dominant color extraction
export const colorTool = {
  schema: {
    description: 'Extract dominant colors from an image or convert color formats',
    parameters: { type: 'object', properties: {
      image_url: { type: 'string', description: 'Image URL to extract palette from' },
      hex: { type: 'string', description: 'Hex color to convert (e.g., #ff6b35)' },
    } },
  },
  async execute({ image_url, hex }) {
    if (hex) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
      const hsl = rgbToHsl(r, g, b)
      return { success: true, tool: 'color_palette', hex, rgb: { r, g, b }, hsl }
    }
    if (!image_url) return { success: false, error: 'Provide image_url or hex' }
    const img = new Image(); img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = image_url })
    const canvas = document.createElement('canvas')
    const size = 50; canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    const buckets = {}
    for (let i = 0; i < data.length; i += 16) {
      const key = `${data[i] >> 4},${data[i+1] >> 4},${data[i+2] >> 4}`
      buckets[key] = (buckets[key] || 0) + 1
    }
    const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const palette = sorted.map(([k]) => {
      const [r, g, b] = k.split(',').map(n => parseInt(n) * 16 + 8)
      return `#${[r,g,b].map(c => c.toString(16).padStart(2, '0')).join('')}`
    })
    return { success: true, tool: 'color_palette', palette }
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) }
}
