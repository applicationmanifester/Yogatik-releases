// Tesseract.js — OCR in the browser, via CDN.
//
// The old version was six useful lines: load the script, call recognize() on
// whatever URL it was handed, return the text. Three consequences, all
// measured:
//
//   1. NO PREPROCESSING. A dark-mode UI screenshot returned "10 » | 41 PLEY".
//      Tesseract expects dark ink on a light page; it was shown the inverse at
//      UI scale.
//   2. NO CONFIDENCE FILTER. That fragment was returned as `text` with
//      success:true, and the agent inserted it into the prompt as THE CONTENT
//      OF THE IMAGE. The model answered honestly that it could not identify
//      anything, which looked like a model failure and was a pipeline failure.
//   3. A NEW WORKER PER CALL. recognize() spins up a worker, downloads the
//      ~15MB language traineddata, uses it once and throws it away.
//
// Now: analyse, preprocess into candidate renderings, try them in order on ONE
// persistent worker, keep the best by confidence, and say plainly when the
// result is not trustworthy.

import { loadImageData, classifyImage, describeStructure } from '../vision/imageStats'
import { buildOcrVariants } from '../vision/preprocess'

const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'

/** Below this mean confidence the text is noise, and saying so is the answer. */
export const MIN_TRUSTED_CONFIDENCE = 55
/** Individual words below this are dropped from the returned text. */
export const MIN_WORD_CONFIDENCE = 45

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract
  const script = document.createElement('script')
  script.src = CDN
  document.head.appendChild(script)
  await new Promise((res, rej) => {
    script.onload = res
    // An Event is not an Error; rejecting with one surfaces as "undefined".
    script.onerror = () => rej(new Error('Could not load the OCR engine (tesseract.js).'))
  })
  return window.Tesseract
}

// One worker, reused. Creating one per call re-downloads the traineddata every
// time, which is most of the latency people attribute to "OCR being slow".
const workers = new Map()
let idleTimer = null

async function getWorker(lang) {
  if (workers.has(lang)) return workers.get(lang)
  const Tesseract = await loadTesseract()
  const worker = await Tesseract.createWorker(lang)
  workers.set(lang, worker)
  return worker
}

/** Release workers after a quiet period — each holds tens of MB. */
function scheduleIdleRelease(ms = 60_000) {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    for (const [lang, w] of workers) {
      try { await w.terminate() } catch { /* already gone */ }
      workers.delete(lang)
    }
  }, ms)
}

export async function terminateOcrWorkers() {
  clearTimeout(idleTimer)
  for (const [lang, w] of workers) {
    try { await w.terminate() } catch { /* already gone */ }
    workers.delete(lang)
  }
}

/**
 * Keep only words the engine was actually confident about, and rebuild the
 * lines from them. Returning a fluent-looking sentence assembled from 20%-
 * confidence guesses is worse than returning nothing.
 */
export function filterByConfidence(data, minWord = MIN_WORD_CONFIDENCE) {
  const words = data?.words || []
  if (!words.length) {
    return { text: (data?.text || '').trim(), kept: 0, dropped: 0, meanConfidence: data?.confidence ?? 0 }
  }
  const kept = words.filter(w => (w.confidence ?? 0) >= minWord && String(w.text || '').trim())
  const dropped = words.length - kept.length
  const mean = kept.length
    ? kept.reduce((s, w) => s + (w.confidence || 0), 0) / kept.length
    : 0

  // Rebuild lines from the surviving words using their baselines, so the
  // layout the model sees still matches the picture.
  const lines = []
  let current = null
  for (const w of kept) {
    const top = w.bbox?.y0 ?? 0
    if (!current || Math.abs(top - current.top) > 12) {
      current = { top, words: [] }
      lines.push(current)
    }
    current.words.push(String(w.text).trim())
  }
  return {
    text: lines.map(l => l.words.join(' ')).join('\n').trim(),
    kept: kept.length,
    dropped,
    meanConfidence: Math.round(mean),
  }
}

/** Is this result worth showing to a model as "what the image says"? */
export function isTrustworthy({ meanConfidence, text }) {
  if (!text) return false
  if (meanConfidence < MIN_TRUSTED_CONFIDENCE) return false
  // A handful of stray glyphs with no real word in them is noise, whatever the
  // engine claims about confidence.
  const words = text.split(/\s+/).filter(w => /[A-Za-z]{3,}/.test(w))
  return words.length >= 2 || text.replace(/\s/g, '').length >= 12
}

export const ocrTool = {
  schema: {
    description:
      'Read text out of an image with OCR. Preprocesses first (upscales, corrects for dark themes, ' +
      'raises contrast) and reports how confident it is — a low-confidence result means the image ' +
      'has little legible text, NOT that the text it guessed is what the image says.',
    parameters: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL or data URL of the image' },
        lang: { type: 'string', description: 'Language code (default eng)' },
        raw: { type: 'boolean', description: 'Skip preprocessing and read the image as-is.' },
      },
      required: ['image_url'],
    },
  },
  async execute({ image_url, lang = 'eng', raw = false } = {}) {
    if (typeof image_url !== 'string' || !image_url.trim()) {
      return { success: false, error: 'image_url is required' }
    }
    try {
      const worker = await getWorker(lang)

      // Analyse first: the verdict decides WHICH renderings are worth trying,
      // and it is also useful on its own when there turns out to be no text.
      let analysis = null
      let variants = []
      if (!raw) {
        const img = await loadImageData(image_url)
        if (img) {
          analysis = classifyImage(img)
          variants = buildOcrVariants(img, analysis)
        }
      }
      if (!variants.length) variants = [{ name: 'original', dataUrl: image_url, note: 'unprocessed' }]

      let best = null
      for (const variant of variants) {
        let data
        try { ({ data } = await worker.recognize(variant.dataUrl)) } catch { continue }
        const filtered = filterByConfidence(data)
        const candidate = { ...filtered, variant: variant.name, note: variant.note }
        if (!best || candidate.meanConfidence > best.meanConfidence) best = candidate
        // Good enough — stop paying for the remaining renderings.
        if (best.meanConfidence >= 80 && best.text.length > 20) break
      }
      scheduleIdleRelease()

      if (!best) return { success: false, error: 'OCR produced no result for this image.' }

      const trusted = isTrustworthy(best)
      return {
        success: true,
        tool: 'ocr',
        text: trusted ? best.text : '',
        // The unreliable reading is still returned, but under a name that
        // cannot be mistaken for the content of the image.
        low_confidence_text: trusted ? undefined : best.text || undefined,
        reliable: trusted,
        confidence: best.meanConfidence,
        words_kept: best.kept,
        words_dropped: best.dropped,
        variant: best.variant,
        preprocessing: best.note,
        lang,
        structure: analysis ? describeStructure(analysis) : undefined,
        note: trusted
          ? undefined
          : 'No legible text was found. Do NOT treat the low-confidence fragment as the content of this image — describe the image from its structure and any other signals instead.',
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
