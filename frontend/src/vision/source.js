/**
 * Shared visual source + capture policy.
 *
 * Two rules this file exists to enforce:
 *  1. ONE camera. A live call, the `see` tool and the vision panel must share a
 *     single stream — a second getUserMedia fails outright on most phones.
 *  2. Capture and send pixels only when the question is actually about what is
 *     in front of the user, at a resolution that suits the question. A frame is
 *     ~1.1k tokens; attaching one to "what's the capital of Peru" is waste, and
 *     768px @ q0.7 cannot read a serial number.
 */

import { askLocalVLM, DEFAULT_LOCAL_VLM } from './localVLM'
import { ocrTool } from '../tools/ocr'
import { analyseImage, describeStructure } from './imageStats'
import { classifyZeroShot, detectObjects, summariseDetections, describePosition } from './detect'
import {
  createSessionObjectMemory,
  recordDetections,
  resolveReference,
  clearSessionObjectMemory,
} from './sessionObjectMemory'
import { assessReadability, shouldTrustDescription } from './readable'
import { queryMoondream } from './moondream'

// ─── Shared source ───────────────────────────────────────────────────────────

let shared = null
let sharedObjectMemory = createSessionObjectMemory()

/** Register the stream that owns the camera (the Live session, normally). */
export function setSharedVisualSource(src) { shared = src || null }
export function getSharedVisualSource() {
  return shared && !shared.stopped ? shared : null
}
/** Clear, but only if `src` is still the registered one (avoids racing teardown). */
export function clearSharedVisualSource(src) {
  if (!src || shared === src) shared = null
}

/** Get active session object memory tracker. */
export function getSharedObjectMemory() {
  if (!sharedObjectMemory) sharedObjectMemory = createSessionObjectMemory()
  return sharedObjectMemory
}

/** Reset active session object memory. */
export function resetSharedObjectMemory() {
  if (sharedObjectMemory) clearSessionObjectMemory(sharedObjectMemory)
}

// ─── Question classification ─────────────────────────────────────────────────

const TEXT_RE = /\b(read|reading|says?|say|written|writes|text|label|sign|caption|price|serial|barcode|isbn|expiry|ingredient|spell|ocr|document|receipt|menu|screen(shot)?|error|number|code)\b/i

const MOTION_RE = /\b(doing|happening|moving|moved?|changed?|change|gesture|signing|hands?|before|now|again|still)\b/i

const VISUAL_RE = /\b(see|seeing|look|looks?|looking|watch|show|showing|this|these|that|here|holding|hold|wearing|wear|front of me|camera|screen|colou?r|photo|image|picture|scene|room|desk|face|my |i'?m |am i|is it|which one|how many|count|identify|what'?s? (in|on|this|that))\b/i

/** Would a camera frame plausibly help answer this? */
export function isVisualQuestion(q = '') {
  if (!q.trim()) return false
  return VISUAL_RE.test(q) || TEXT_RE.test(q) || MOTION_RE.test(q)
}

/** Text-heavy questions need resolution; scene questions do not. */
export function needsText(q = '') { return TEXT_RE.test(q) }

/** "What changed / what am I doing" is answered by two frames, not one. */
export function needsMotion(q = '') { return MOTION_RE.test(q) && !TEXT_RE.test(q) }

/**
 * Capture settings for a question.
 * Text: big, sharp, cropped to the middle where people hold things.
 * Scene: small and cheap.
 */
export function captureProfile(q = '') {
  return needsText(q)
    ? { maxEdge: 1280, quality: 0.92, crop: 0.75 }
    : { maxEdge: 768, quality: 0.7, crop: 0 }
}

/**
 * Format raw OCR text with structural layout insights:
 *  - Counts line structure & repeated elements (e.g. 18x \frac{1}{2}).
 *  - Formats raw OCR text cleanly for LLM synthesis.
 */
export function formatOcrText(rawText) {
  if (!rawText || typeof rawText !== 'string') return ''
  const trimmed = rawText.trim()
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const freq = {}
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1
  }

  const repeatedPatterns = Object.entries(freq)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  let summary = ''
  if (repeatedPatterns.length > 0) {
    const patternStr = repeatedPatterns.map(([term, cnt]) => `"${term}" (${cnt}x)`).join(', ')
    summary = `[LAYOUT ANALYSIS: Detected ${lines.length} line(s), ${tokens.length} total token(s). Repeated patterns: ${patternStr}]\n\n`
  }

  return summary + trimmed
}

// ─── Model-free vision (fallback chain) ──────────────────────────────────────

/**
 * Answer about an image without a vision-capable chat model.
 * Text questions go to Tesseract (far better at glyphs than a 256M VLM);
 * everything else goes to the on-device VLM. Each falls back to the other.
 *
 * @param {string} image data URL
 * @param {string} question
 * @returns {Promise<{via:string, text:string, model?:string}>}
 */
export async function describeWithoutModel(image, question = '') {
  // Everything that can contribute, gathered in parallel and FUSED. The old
  // version picked exactly one source — OCR or the VLM — and returned it
  // alone, so a dark-mode video-player screenshot became the string
  // "10 » | 41 PLEY" and the model was told that was the image's content.
  //
  // Structure always runs: it needs no model, no download and no network, and
  // "a dark 16:9 UI screenshot with a text band at the bottom" is far more
  // useful than a garbled fragment.
  const parts = []
  const sources = []

  let moondreamAns = null
  try {
    const { getApiKey } = await import('../db')
    const mdKey = await getApiKey('moondream').catch(() => '')
    if (mdKey) {
      const md = await queryMoondream({ image, question, apiKey: mdKey }).catch(() => null)
      if (md?.answer) moondreamAns = md.answer
    }
  } catch {}

  const [structure, ocr, labels, objects, vlm] = await Promise.all([
    analyseImage(image).catch(() => null),
    ocrTool.execute({ image_url: image }).catch(() => null),
    // The detectors and the VLM decline unless the user has switched on
    // on-device vision, so on a default install these resolve to null for
    // free and the free layers still answer.
    classifyZeroShot(image).catch(() => null),
    detectObjects(image).catch(() => null),
    askLocalVLM(image, question || 'Describe what you see, briefly and concretely.').catch(() => null),
  ])

  // FRAME QUALITY FIRST, before anything derived from the pixels.
  //
  // Both Tesseract and a 256M VLM collapse in the dark — they do not fail,
  // they invent, and the invention arrives looking exactly like a reading.
  // "Az", "Hoag", "d =" came from an underexposed webcam frame and were
  // handed to the model as the content of the image. Leading with the caveat
  // is what stops the model treating noise as text, and it has to come first:
  // a warning appended after three paragraphs of confident description does
  // not change the conclusion the model has already drawn.
  const quality = assessReadability(structure)
  if (!quality.readable) {
    parts.push(`FRAME QUALITY: ${quality.reason}. ${quality.advice} `
      + 'Say this to the user rather than guessing at what is in the picture.')
    sources.push('quality')
  }

  if (structure) {
    parts.push(`STRUCTURE: ${describeStructure(structure)}`)
    sources.push('structure')
  }

  if (labels?.length) {
    const top = labels.slice(0, 3).filter(l => l.score > 0.05)
    if (top.length) {
      parts.push(`LOOKS LIKE: ${top.map(l => `${l.label} (${Math.round(l.score * 100)}%)`).join('; ')}`)
      sources.push('zero-shot')
    }
  }

  if (objects?.length) {
    try { recordDetections(getSharedObjectMemory(), objects) } catch {}
    const summary = summariseDetections(objects)
    const placed = objects.slice(0, 8).map(o => `${o.label} (${describePosition(o.box)})`).join(', ')
    parts.push(`OBJECTS: ${summary}. Positions: ${placed}.`)
    sources.push('detection')

    // Referential grounding for spatial questions ("the one on the left", etc.)
    if (question) {
      try {
        const ref = resolveReference(getSharedObjectMemory(), question)
        if (ref.resolved) {
          parts.push(`REFERENTIAL GROUNDING: ${ref.explanation}`)
          sources.push('referential-grounding')
        }
      } catch {}
    }
  }

  if (vlm) {
    parts.push(`DESCRIPTION (on-device vision model): ${vlm}`)
    sources.push('local-vlm')
  }

  if (moondreamAns) {
    parts.push(`DESCRIPTION (Moondream VLM): ${moondreamAns}`)
    sources.push('moondream')
  }

  // Even "reliable" OCR is not trustworthy out of a frame this bad — the
  // confidence score is computed over what Tesseract THINKS it saw, so noise
  // it is sure about still scores well.
  const trust = shouldTrustDescription({
    analysis: structure,
    ocrText: ocr?.text || ocr?.low_confidence_text || '',
    ocrConfidence: ocr?.confidence ?? null,
  })

  if (!trust.trust && (ocr?.text || ocr?.low_confidence_text)) {
    parts.push(`TEXT IN IMAGE: not legible. ${trust.note} `
      + 'Do NOT repeat or interpret any characters from this frame — they are not real text.')
    sources.push('ocr-untrusted')
  } else if (ocr?.success && ocr.reliable && ocr.text) {
    parts.push(`TEXT IN IMAGE (OCR, ${ocr.confidence}% confidence):\n${formatOcrText(ocr.text)}`)
    sources.push('ocr')
  } else if (ocr?.success && ocr.low_confidence_text) {
    // Named so it cannot be mistaken for content. This single distinction is
    // what stops the model from reasoning about "41 PLEY" as if it meant
    // something.
    parts.push(
      `TEXT IN IMAGE: none legible (best attempt was ${ocr.confidence}% confidence: ` +
      `"${ocr.low_confidence_text.slice(0, 80).replace(/\s+/g, ' ')}" — treat this as noise, not as content).`,
    )
    sources.push('ocr-failed')
  }

  if (!parts.length) throw new Error('the image could not be read on this device')

  return {
    via: sources.join('+'),
    sources,
    structure,
    ocr: ocr?.reliable ? ocr.text : '',
    labels: labels?.slice(0, 5) || [],
    objects: objects || [],
    text: parts.join('\n\n'),
    model: vlm ? DEFAULT_LOCAL_VLM : undefined,
  }
}
