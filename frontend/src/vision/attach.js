/**
 * Prepare a user-attached image.
 *
 * A phone photo is 3-6MB and ~4000px wide. Sent as-is it wastes tokens, stalls
 * on mobile upload, and cannot be kept in IndexedDB. Downscaling happens once,
 * here, so the same bytes go to the model, to OCR and to the stored message.
 */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
export const isImageFile = (file) => !!file && IMAGE_TYPES.includes(file.type)

const MAX_EDGE = 1280        // enough to read a serial number; 768 is not
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
 * @returns {Promise<{dataUrl:string, thumb:string, width:number, height:number, name:string}>}
 */
export async function prepareImage(file) {
  const src = await readAsDataURL(file)
  const img = await loadImage(src)

  const full = draw(img, MAX_EDGE)
  const small = draw(img, THUMB_EDGE)

  if (!full.w || !full.h) throw new Error('Image has zero dimensions and cannot be processed.')

  // Format-aware encoding:
  //   GIF  — toDataURL on a canvas always loses animation; pass the original
  //           data URL through so the model at least sees the first frame intact.
  //   PNG/WEBP — preserve lossless format only when the file is small (≤ 300 KB)
  //              to avoid the 8× size penalty on large screenshots.
  //   Everything else — JPEG for compact, model-friendly delivery.
  const isGif  = file.type === 'image/gif'
  const isPng  = file.type === 'image/png'
  const isWebp = file.type === 'image/webp'
  let dataUrl
  if (isGif) {
    // Canvas round-trip would freeze animation and lose transparency.
    dataUrl = src
  } else if ((isPng || isWebp) && file.size <= 300_000) {
    dataUrl = full.canvas.toDataURL(file.type)
  } else {
    dataUrl = full.canvas.toDataURL('image/jpeg', QUALITY)
  }

  return {
    name: file.name || 'image',
    width: full.w,
    height: full.h,
    dataUrl,
    // Tiny JPEG thumbnail for the transcript so history stays small.
    thumb: small.canvas.toDataURL('image/jpeg', 0.72),
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
