/**
 * Promptable segmentation on device — "cut out the thing I'm pointing at".
 *
 * WHY SlimSAM AND NOT SAM. Meta's SAM (Apache-2.0) is two halves: a heavy ViT
 * image ENCODER and a tiny mask DECODER. Their own web demo runs only the
 * decoder in the browser and keeps the encoder on a server, because ViT-H is
 * 2.4GB and even ViT-B is ~375MB. This app has no server by design, so that
 * split is not available to it. SlimSAM is a pruned-and-distilled SAM whose
 * encoder is small enough to run client-side, which is the only shape of this
 * feature that fits the product.
 *
 * Same rules as detect.js and localVLM.js, learned the hard way:
 *  - the download is a DECISION, not a fallback. Nothing here runs until the
 *    user has switched on-device vision on, or the weights are already cached.
 *  - loaded from esm.run, so a user who never turns it on pays nothing — not a
 *    byte of bundle, not a module in the graph.
 *  - WebGPU when a real adapter answers, wasm otherwise. `!!navigator.gpu` is
 *    not availability; gpu.js probes properly.
 *
 * The pixel and mask maths lives in maskOps.js, which is pure and testable
 * without any of this.
 */

import { webgpuDevice } from '../gpu'
import {
  thresholdMask, stabilityScore, maskArea, maskBBox,
  removeSmallRegions, largestComponent, pickBestMask, padBox,
} from './maskOps'

const CDN = 'https://esm.run/@huggingface/transformers@3.7.6'

export const SEGMENTER = {
  id: 'Xenova/slimsam-77-uniform',
  label: 'SlimSAM (promptable segmentation)',
  sizeMB: 40,
  note: 'Cuts out the object you point at. Runs entirely on your device.',
}

let consented = false
/** App mirrors the `localVision` feature toggle in here, as it does for the VLM. */
export function setSegmentConsent(v) { consented = !!v }

let cached = null
let loading = null

export async function isSegmenterCached() {
  try {
    if (typeof caches === 'undefined') return false
    for (const key of await caches.keys()) {
      const c = await caches.open(key)
      const hits = await c.keys()
      if (hits.some(r => r.url.includes('slimsam'))) return true
    }
  } catch { /* Cache Storage unavailable (private mode) */ }
  return false
}

async function load() {
  if (cached) return cached
  if (loading) return loading
  if (!consented && !(await isSegmenterCached())) {
    throw new Error('On-device vision is switched off. Enable it in Personalise to download the segmentation model (~40MB, one time).')
  }
  loading = (async () => {
    const t = await import(/* @vite-ignore */ CDN)
    const device = (await webgpuDevice()) ? 'webgpu' : 'wasm'
    const [model, processor] = await Promise.all([
      t.SamModel.from_pretrained(SEGMENTER.id, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8' }),
      t.AutoProcessor.from_pretrained(SEGMENTER.id),
    ])
    cached = { t, model, processor, device }
    return cached
  })()
  try { return await loading } finally { loading = null }
}

/**
 * Segment whatever is at a point (or inside a box).
 *
 * @param {string} image      data URL or object URL
 * @param {object} prompt
 * @param {[number,number][]} [prompt.points]  image-space [x,y]; defaults to the centre
 * @param {number[]}          [prompt.labels]  1 = include, 0 = exclude. Defaults to all-include
 * @param {{x,y,width,height}}[prompt.box]     alternative to points
 * @returns {Promise<{mask, width, height, bbox, area, coverage, iou, stability, device}>}
 */
export async function segmentAt(image, prompt = {}) {
  const { t, model, processor, device } = await load()
  const raw = await t.RawImage.read(image)

  // The centre is the only defensible default: it is where a user points a
  // camera at a thing, and it needs no guessing about what "the subject" is.
  const points = prompt.points?.length
    ? prompt.points
    : prompt.box
      ? [[prompt.box.x + prompt.box.width / 2, prompt.box.y + prompt.box.height / 2]]
      : [[raw.width / 2, raw.height / 2]]
  const labels = prompt.labels?.length ? prompt.labels : points.map(() => 1)

  const inputs = await processor(raw, {
    input_points: [[points.map(([x, y]) => [x, y])]],
    input_labels: [[labels]],
  })
  const out = await model({ ...inputs })

  // post_process_masks returns masks at the ORIGINAL image size. Skipping it
  // and using the raw 256x256 logits would give a mask that looks right and is
  // offset from the picture it describes.
  const processed = await processor.post_process_masks(
    out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes,
  )
  const masks = processed[0]
  const scores = Array.from(out.iou_scores.data || [])

  const [count, height, width] = masks.dims.slice(-3)
  const per = height * width
  const logits = out.pred_masks.data

  const candidates = []
  for (let i = 0; i < count; i++) {
    // post_process_masks already thresholds; the raw logits are only used for
    // the stability score, which is a question about the threshold itself.
    const bits = masks.data.slice(i * per, (i + 1) * per)
    const mask = new Uint8Array(per)
    for (let j = 0; j < per; j++) mask[j] = bits[j] ? 1 : 0
    const slice = logits.subarray
      ? logits.subarray(i * (logits.length / count), (i + 1) * (logits.length / count))
      : null
    candidates.push({
      mask,
      iou: scores[i] ?? 0,
      stability: slice ? stabilityScore(slice, 0, 1) : 1,
    })
  }

  const best = pickBestMask(candidates, { width, height })
  if (!best) {
    return {
      ok: false,
      error: 'No confident mask. Every candidate was empty or covered the whole frame — point at the object rather than the background.',
    }
  }

  // Speckle elsewhere in the frame makes the bounding box the whole image, so
  // a "crop to the object" that silently returns the original picture.
  const minArea = Math.max(16, Math.round(width * height * 0.0004))
  let mask = removeSmallRegions(best.mask, width, height, minArea, 'both')
  if (prompt.singleObject !== false) mask = largestComponent(mask, width, height)

  const area = maskArea(mask)
  const bbox = maskBBox(mask, width, height)
  if (!bbox || !area) {
    return { ok: false, error: 'The mask disappeared once speckle was removed — nothing solid was found at that point.' }
  }

  return {
    ok: true,
    mask,
    width,
    height,
    bbox,
    area,
    coverage: area / (width * height),
    iou: best.iou,
    stability: best.stability,
    device,
  }
}

/**
 * Render a segmentation result to images.
 * Separated from segmentAt so the model half stays free of canvas work and the
 * canvas half can be exercised without a 40MB download.
 *
 * @returns {{cutout:string, crop:string, overlay:string}} data URLs
 */
export async function renderMask(image, { mask, width, height, bbox }, { pad = 8, background = 'transparent' } = {}) {
  if (typeof document === 'undefined') throw new Error('renderMask needs a browser')
  const img = await loadImage(image)

  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  const fx = full.getContext('2d')
  fx.drawImage(img, 0, 0, width, height)
  const data = fx.getImageData(0, 0, width, height)

  // Overlay first: it reads the pixels before they are punched out.
  const overlay = document.createElement('canvas')
  overlay.width = width
  overlay.height = height
  const ox = overlay.getContext('2d')
  ox.drawImage(img, 0, 0, width, height)
  const tint = ox.getImageData(0, 0, width, height)
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue
    tint.data[p] = Math.min(255, tint.data[p] * 0.45 + 255 * 0.55)
    tint.data[p + 1] = tint.data[p + 1] * 0.45
    tint.data[p + 2] = tint.data[p + 2] * 0.45 + 60 * 0.55
  }
  ox.putImageData(tint, 0, 0)

  // Cutout: everything outside the mask becomes transparent (or a flat colour).
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i]) continue
    if (background === 'transparent') { data.data[p + 3] = 0 } else {
      data.data[p] = 255; data.data[p + 1] = 255; data.data[p + 2] = 255
    }
  }
  fx.putImageData(data, 0, 0)

  // Crop to the padded box. THIS is the one that makes OCR work: a pill
  // imprint filling the frame is legible where the same imprint at 6% of a
  // cluttered photo is not.
  const box = padBox(bbox, pad, width, height)
  const crop = document.createElement('canvas')
  crop.width = box.width
  crop.height = box.height
  crop.getContext('2d').drawImage(full, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)

  return {
    // PNG for the cutout: JPEG has no alpha, so a "transparent background"
    // exported as JPEG comes out black.
    cutout: full.toDataURL('image/png'),
    crop: crop.toDataURL('image/jpeg', 0.92),
    overlay: overlay.toDataURL('image/jpeg', 0.9),
    box,
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the image'))
    img.src = src
  })
}

/** Test hook. */
export function _resetSegmenter() { cached = null; loading = null; consented = false }
