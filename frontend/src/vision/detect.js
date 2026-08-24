/**
 * Object detection and zero-shot labelling, on device.
 *
 * Two models, loaded from esm.run exactly like localVLM.js so that a user who
 * never turns this on pays nothing for it:
 *
 *   CLIP  — answers "what KIND of thing is this?" against any list of labels
 *           you hand it. There is no training step and no fixed vocabulary, so
 *           "a screenshot of a video player" is as answerable as "a dog".
 *   DETR  — answers "what things are in it and where?" with boxes and counts.
 *
 * Downloads are a decision, not a fallback: nothing here runs until the user
 * has switched it on, the same rule localVLM learned the hard way when the
 * blind-model path started pulling 230MB with nothing on screen to say so.
 */

import { webgpuDevice } from '../gpu'

const CDN = 'https://esm.run/@huggingface/transformers@3.7.6'

export const DETECTORS = {
  clip: {
    id: 'Xenova/clip-vit-base-patch32',
    task: 'zero-shot-image-classification',
    label: 'CLIP (zero-shot labels)',
    sizeMB: 90,
    note: 'Names what kind of image it is against any labels you supply.',
  },
  detr: {
    id: 'Xenova/detr-resnet-50',
    task: 'object-detection',
    label: 'DETR (object detection)',
    sizeMB: 40,
    note: 'Finds and counts objects, with positions.',
  },
}

/**
 * The default question put to CLIP. Deliberately covers the SURFACES this app
 * meets — screenshots of software — as well as ordinary photo subjects,
 * because "screenshot of a video player" is exactly the answer that was
 * missing when a video-player screenshot produced "10 » | 41 PLEY".
 */
export const DEFAULT_LABELS = [
  'a screenshot of a video player or streaming service',
  'a screenshot of a code editor or terminal',
  'a screenshot of a web browser',
  'a screenshot of a chat or messaging app',
  'a screenshot of a spreadsheet or data table',
  'a screenshot of a settings or configuration screen',
  'a screenshot of an error message or crash dialog',
  'a chart, graph or data visualisation',
  'a diagram, flowchart or architecture drawing',
  'a scanned document or page of printed text',
  'a handwritten note',
  'a photograph of people',
  'a photograph of an outdoor scene or landscape',
  'a photograph of food',
  'a photograph of a product or object on a plain background',
  'a photograph of an animal',
  'a map',
  'a poster, book cover or album art',
  'a user interface mockup or design',
  'a meme or image with overlaid caption text',
]

let lib = null
const pipes = new Map()
const loading = new Map()
let consented = false

/** App mirrors the `localVision` feature toggle in here, as for the VLM. */
export function setDetectorConsent(v) { consented = !!v }
export function hasDetectorConsent() { return consented }

async function getLib() {
  if (!lib) lib = await import(/* @vite-ignore */ CDN)
  return lib
}

/** True once the weights are in the Transformers.js cache — then it is free. */
export async function isDetectorCached(key) {
  const spec = DETECTORS[key]
  if (!spec || typeof caches === 'undefined') return false
  try {
    for (const name of await caches.keys()) {
      if (!/transformers/i.test(name)) continue
      const cache = await caches.open(name)
      if ((await cache.keys()).some(r => r.url.includes(spec.id))) return true
    }
  } catch { /* opaque storage: assume not cached */ }
  return false
}

async function getPipeline(key, { onProgress } = {}) {
  const spec = DETECTORS[key]
  if (!spec) throw new Error(`Unknown detector: ${key}`)
  if (pipes.has(key)) return pipes.get(key)
  if (loading.has(key)) return loading.get(key)

  if (!consented && !(await isDetectorCached(key))) {
    throw new Error(
      `On-device ${spec.label} needs a one-time ${spec.sizeMB}MB download. ` +
      'Turn on "On-device vision" in Personalise to allow it.',
    )
  }

  const job = (async () => {
    const { pipeline } = await getLib()
    const device = await webgpuDevice()
    const pipe = await pipeline(spec.task, spec.id, {
      // wasm is the honest default: requestAdapter() returning null is common
      // in VMs and on blocklisted drivers, and !!navigator.gpu does not tell
      // you that (see gpu.js).
      device: device === 'webgpu' ? 'webgpu' : 'wasm',
      dtype: 'q8',
      progress_callback: onProgress,
    })
    pipes.set(key, pipe)
    return pipe
  })()
  loading.set(key, job)
  try { return await job } finally { loading.delete(key) }
}

/**
 * "What kind of image is this?" — scored against a label list.
 * @returns {Promise<Array<{label, score}>>} best first
 */
export async function classifyZeroShot(image, labels = DEFAULT_LABELS, opts = {}) {
  const pipe = await getPipeline('clip', opts)
  const out = await pipe(image, labels)
  return (Array.isArray(out) ? out : [])
    .map(r => ({ label: r.label, score: Number(r.score) }))
    .sort((a, b) => b.score - a.score)
}

/**
 * "What is in it, and where?"
 * @returns {Promise<Array<{label, score, box}>>}
 */
export async function detectObjects(image, { threshold = 0.5, ...opts } = {}) {
  const pipe = await getPipeline('detr', opts)
  const out = await pipe(image, { threshold, percentage: true })
  return (Array.isArray(out) ? out : []).map(r => ({
    label: r.label,
    score: Number(r.score),
    box: r.box,
  }))
}

/** Group detections into "3 people, 1 laptop" — what a person would say. */
export function summariseDetections(objects = []) {
  if (!objects.length) return ''
  const counts = new Map()
  for (const o of objects) counts.set(o.label, (counts.get(o.label) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => (n === 1 ? `a ${label}` : `${n} ${label}s`))
    .join(', ')
}

/** Where in the frame something sits, in words rather than coordinates. */
export function describePosition(box) {
  if (!box) return ''
  const cx = ((box.xmin ?? 0) + (box.xmax ?? 0)) / 2
  const cy = ((box.ymin ?? 0) + (box.ymax ?? 0)) / 2
  const h = cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'centre'
  const v = cy < 0.33 ? 'top' : cy > 0.66 ? 'bottom' : 'middle'
  return v === 'middle' && h === 'centre' ? 'centre' : `${v} ${h}`
}

export function _resetDetectors() { pipes.clear(); loading.clear(); consented = false }
