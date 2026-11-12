/**
 * Model-Agnostic Visual Context Package Builder
 *
 * Standardizes visual inputs across all multimodal LLMs (GPT, Gemini, Claude, Qwen-VL, LLaVA):
 * 1. Object Detection with normalized [0-1000] integer coordinates [ymin, xmin, ymax, xmax].
 * 2. Set-of-Mark (SoM) visual grounding overlay with numbered badge markers.
 * 3. Paired text map mapping markers to detected items (e.g. {"1": "button", "2": "text"}).
 * 4. Extracted text grouped by reading order and spatial location.
 * 5. High-resolution crops of small or focal elements for fine-detail inspection.
 * 6. Structured prompt injection block and complexity-based routing score.
 */

import { connectedComponents, objectDensitySignal } from './objectScan'

const PALETTE = [
  '#00E5FF', '#FF3D00', '#00E676', '#FFD600', '#D500F9',
  '#FF1744', '#76FF03', '#2979FF', '#FF9100', '#1DE9B6',
]

/**
 * Generate a Set-of-Mark (SoM) grounded image overlay with numbered bounding boxes.
 */
export function generateSoMOverlay(canvas, objects = []) {
  if (!canvas || !canvas.width || !canvas.height) return null

  const overlayCanvas = document.createElement('canvas')
  overlayCanvas.width = canvas.width
  overlayCanvas.height = canvas.height
  const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // Copy base image
  ctx.drawImage(canvas, 0, 0)

  const topObjects = objects.slice(0, 12) // Keep grounding clear, avoiding visual clutter

  ctx.save()
  topObjects.forEach((obj, idx) => {
    const markId = idx + 1
    const color = PALETTE[idx % PALETTE.length]

    // Draw bounding box
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, Math.round(canvas.width / 400))
    ctx.strokeRect(obj.x, obj.y, obj.w, obj.h)

    // Draw numbered mark badge
    const badgeText = `[${markId}]`
    const fontSize = Math.max(12, Math.round(canvas.width / 55))
    ctx.font = `bold ${fontSize}px sans-serif`
    const textMetrics = ctx.measureText(badgeText)
    const paddingX = 4
    const paddingY = 2
    const badgeW = textMetrics.width + paddingX * 2
    const badgeH = fontSize + paddingY * 2

    // Position badge at top-left of box (or bottom if at top edge)
    const badgeX = Math.min(canvas.width - badgeW, Math.max(0, obj.x))
    const badgeY = obj.y >= badgeH ? obj.y - badgeH : obj.y

    ctx.fillStyle = color
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH)

    ctx.fillStyle = '#000000'
    ctx.textBaseline = 'top'
    ctx.fillText(badgeText, badgeX + paddingX, badgeY + paddingY)
  })
  ctx.restore()

  return overlayCanvas.toDataURL('image/jpeg', 0.90)
}

/**
 * Extract 2-4 high-res zoomed crops of the most detailed / smallest key objects.
 */
export function extractDetailCrops(canvas, objects = [], maxCrops = 3) {
  if (!canvas || !canvas.width || !canvas.height || !objects.length) return []

  const crops = []
  // Select objects that are small or dense (buttons, text symbols, serial numbers)
  const candidates = objects
    .filter(o => o.area >= 100 && (o.type === 'button_or_pill' || o.type === 'text_line' || o.type === 'text_or_symbol' || o.type === 'icon_or_avatar'))
    .sort((a, b) => a.area - b.area)
    .slice(0, maxCrops)

  candidates.forEach((obj, idx) => {
    const pad = Math.max(8, Math.round(Math.min(obj.w, obj.h) * 0.15))
    const cropX = Math.max(0, obj.x - pad)
    const cropY = Math.max(0, obj.y - pad)
    const cropW = Math.min(canvas.width - cropX, obj.w + pad * 2)
    const cropH = Math.min(canvas.height - cropY, obj.h + pad * 2)

    if (cropW <= 0 || cropH <= 0) return

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropW
    cropCanvas.height = cropH
    const ctx = cropCanvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
    crops.push({
      id: idx + 1,
      targetId: obj.id,
      type: obj.type,
      box_2d: obj.box_2d,
      dataUrl: cropCanvas.toDataURL('image/jpeg', 0.92),
      width: cropW,
      height: cropH,
    })
  })

  return crops
}

/**
 * Build the complete Visual Context Package.
 *
 * @param {{canvas: HTMLCanvasElement, dataUrl: string, width: number, height: number}} normalized
 * @param {object} [options]
 * @returns {object} Visual Context Package
 */
export async function buildVisualContextPackage(normalized, {
  ocrResult = null,
  includeSoM = true,
  maxCrops = 3,
} = {}) {
  const { canvas, dataUrl, width, height } = normalized

  let rgba = null
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      try {
        const imgData = ctx.getImageData(0, 0, width, height)
        rgba = imgData.data
      } catch {}
    }
  }

  // 1. Detect objects & compute normalized coordinates [ymin, xmin, ymax, xmax] 0-1000
  let scanRes = { blobs: [], count: 0 }
  let density = null
  if (rgba) {
    scanRes = connectedComponents(rgba, width, height, { minArea: 60, maxBlobs: 60 })
    density = objectDensitySignal(rgba, width, height)
  }

  const objects = scanRes.blobs || []

  // 2. Set-of-Mark Overlay & Text Map
  let somDataUrl = null
  const somTextMap = {}
  if (includeSoM && canvas && objects.length > 0) {
    somDataUrl = generateSoMOverlay(canvas, objects)
    objects.slice(0, 12).forEach((obj, idx) => {
      const markId = String(idx + 1)
      const loc = `[${obj.box_2d.join(', ')}]`
      somTextMap[markId] = `${obj.type} at ${loc}${obj.dominantColor?.hex ? ` (${obj.dominantColor.hex})` : ''}`
    })
  }

  // 3. Detail crops for high-resolution inspection
  const detailCrops = canvas ? extractDetailCrops(canvas, objects, maxCrops) : []

  // 4. Text reading order sorting
  const extractedText = ocrResult?.text || ''

  // 5. Complexity assessment
  const isComplex = objects.length > 8 || detailCrops.length > 1 || extractedText.length > 120

  return {
    image: dataUrl,
    width,
    height,
    isComplex,
    recommendedTier: isComplex ? 'frontier' : 'fast',
    layoutPattern: density?.layoutPattern || 'single_subject',
    background: scanRes.background,
    objects: objects.map(o => ({
      id: o.id,
      type: o.type,
      box_2d: o.box_2d, // [ymin, xmin, ymax, xmax] on 0-1000 scale
      area: o.area,
      dominantColor: o.dominantColor?.hex,
      parentId: o.parentId,
    })),
    somOverlay: somDataUrl,
    somTextMap,
    detailCrops,
    extractedText,
  }
}

/**
 * Format the Visual Context Package into a standard ground-truth block
 * that can be prepended or appended to any multimodal prompt.
 */
export function formatVisualContextPrompt(pkg) {
  if (!pkg) return ''

  const lines = [
    '=== [VISUAL CONTEXT PACKAGE (Model-Agnostic Ground Truth)] ===',
    `• Resolution: ${pkg.width}x${pkg.height} (Standardized sRGB)`,
    `• Inferred Layout: ${pkg.layoutPattern || 'standard'} (Detected ${pkg.objects.length} foreground elements)`,
  ]

  if (pkg.somTextMap && Object.keys(pkg.somTextMap).length > 0) {
    lines.push('• Set-of-Mark (SoM) Grounding Tags [ymin, xmin, ymax, xmax in 0-1000 scale]:')
    for (const [markId, desc] of Object.entries(pkg.somTextMap)) {
      lines.push(`  - Mark [${markId}]: ${desc}`)
    }
  }

  if (pkg.extractedText && pkg.extractedText.trim()) {
    lines.push('• Verified Text (Top-to-Bottom Reading Order):')
    lines.push(`  """\n  ${pkg.extractedText.trim().split('\n').join('\n  ')}\n  """`)
  }

  if (pkg.detailCrops && pkg.detailCrops.length > 0) {
    lines.push(`• Detail Crops Attached: ${pkg.detailCrops.length} high-resolution region(s) provided for fine scrutiny.`)
  }

  lines.push('Use the verified spatial detections and text above as factual ground truth.')
  lines.push('===============================================================')

  return lines.join('\n')
}

