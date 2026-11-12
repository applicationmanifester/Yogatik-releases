/**
 * Prepare a user-attached image.
 *
 * A phone photo is 3-6MB and ~4000px wide. Sent as-is it wastes tokens, stalls
 * on mobile upload, and cannot be kept in IndexedDB. Downscaling happens once,
 * here, so the same bytes go to the model, to OCR and to the stored message.
 */

import { adaptiveEnhanceCanvas } from './preprocess'
import { normalizeImage, TARGET_MAX_EDGE } from './universalNormalize'
import { buildVisualContextPackage } from './visualContextPackage'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
export const isImageFile = (file) => !!file && IMAGE_TYPES.includes(file.type)

const MAX_EDGE = TARGET_MAX_EDGE        // safe dimensions (1024-1568px)
const QUALITY = 0.9
const THUMB_EDGE = 320       // what the message bubble shows

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file could not be read as an image'))
    img.src = src
  })
}

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('Could not read the file'))
  r.readAsDataURL(file)
})

function draw(img, maxEdge) {
  // Guard: SVGs without explicit dimensions and broken blob URLs can produce
  // naturalWidth/naturalHeight = 0, making Math.max = 0 → scale = Infinity →
  // NaN canvas dimensions → browser throw. Treat as 1×1 so the caller gets
  // a valid (if tiny) result instead of a crash.
  const natW = img.naturalWidth  || img.width  || 0
  const natH = img.naturalHeight || img.height || 0
  if (!natW || !natH) return { canvas: document.createElement('canvas'), w: 0, h: 0 }

  const scale = Math.min(1, maxEdge / Math.max(natW, natH))
  const w = Math.max(1, Math.round(natW * scale))
  const h = Math.max(1, Math.round(natH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  // willReadFrequently: true tells the browser to keep a CPU-readable copy,
  // avoiding a costly GPU→CPU readback stall when toDataURL() is called.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, w, h }
}

/**
 * @returns {Promise<{dataUrl:string, thumb:string, width:number, height:number, name:string, visualContext?:object}>}
 */
export async function prepareImage(file) {
  const isGif = file?.type === 'image/gif'
  let normalized = null
  if (!isGif && typeof document !== 'undefined' && typeof Image === 'function') {
    try {
      normalized = await normalizeImage(file, {
        maxEdge: MAX_EDGE,
        quality: QUALITY,
        enhance: true,
      })
    } catch {
      // Fallback to canvas draw if direct normalization throws in non-standard DOM
    }
  }

  let full, small, src, dataUrl
  if (normalized?.canvas && normalized.width && normalized.height) {
    full = { canvas: normalized.canvas, w: normalized.width, h: normalized.height }
    small = draw(normalized.canvas, THUMB_EDGE)
    dataUrl = normalized.dataUrl
  } else {
    src = await readAsDataURL(file)
    const img = await loadImage(src)

    full = draw(img, MAX_EDGE)
    small = draw(img, THUMB_EDGE)

    if (!full.w || !full.h) throw new Error('Image has zero dimensions and cannot be processed.')

    if (!isGif) {
      const enhanceRes = adaptiveEnhanceCanvas(full.canvas)
      if (enhanceRes?.enhanced) {
        adaptiveEnhanceCanvas(small.canvas)
      }
    }

    const isPng = file?.type === 'image/png'
    const isWebp = file?.type === 'image/webp'
    if (isGif) {
      dataUrl = src
    } else if ((isPng || isWebp) && (file.size || 0) <= 300_000) {
      dataUrl = full.canvas.toDataURL(file.type)
    } else {
      dataUrl = full.canvas.toDataURL('image/jpeg', QUALITY)
    }
  }

  // Generate Model-Agnostic Visual Context Package (objects, SoM tags, normalized 0-1000 coordinates)
  let visualContext = null
  if (full?.canvas) {
    try {
      visualContext = await buildVisualContextPackage(
        { canvas: full.canvas, dataUrl, width: full.w, height: full.h },
        { includeSoM: true }
      )
    } catch {
      // Safe fallback: package is purely additive
    }
  }

  return {
    name: file?.name || 'image',
    width: full.w,
    height: full.h,
    dataUrl,
    thumb: small.canvas?.toDataURL ? small.canvas.toDataURL('image/jpeg', 0.72) : dataUrl,
    visualContext,
  }
}

/** The image on a clipboard paste, or null. */
export function imageFromClipboard(event) {
  const items = event.clipboardData?.items || []
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

/** The first image among dropped files, or null. */
export function imageFromDrop(event) {
  const files = [...(event.dataTransfer?.files || [])]
  return files.find(f => f.type.startsWith('image/')) || null
}
