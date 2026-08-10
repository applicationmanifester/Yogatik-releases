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
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
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
  return {
    name: file.name || 'image',
    width: full.w,
    height: full.h,
    // JPEG for the model (a screenshot PNG can be 8x larger for no gain),
    dataUrl: full.canvas.toDataURL('image/jpeg', QUALITY),
    // and a tiny thumbnail for the transcript, so history stays small.
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
