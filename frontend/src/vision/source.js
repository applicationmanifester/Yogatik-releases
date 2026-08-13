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

// ─── Shared source ───────────────────────────────────────────────────────────

let shared = null

/** Register the stream that owns the camera (the Live session, normally). */
export function setSharedVisualSource(src) { shared = src || null }
export function getSharedVisualSource() {
  return shared && !shared.stopped ? shared : null
}
/** Clear, but only if `src` is still the registered one (avoids racing teardown). */
export function clearSharedVisualSource(src) {
  if (!src || shared === src) shared = null
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
  const textFirst = needsText(question)

  const runOcr = async () => {
    const r = await ocrTool.execute({ image_url: image })
    const text = (r?.text || r?.result || '').trim()
    if (!text) throw new Error('no text found')
    return { via: 'ocr', text: formatOcrText(text) }
  }
  const runVlm = async () => ({
    via: 'local-vlm',
    model: DEFAULT_LOCAL_VLM,
    text: await askLocalVLM(image, question || 'Describe what you see, briefly and concretely.'),
  })

  const [first, second] = textFirst ? [runOcr, runVlm] : [runVlm, runOcr]
  try {
    return await first()
  } catch (e) {
    try {
      return await second()
    } catch {
      throw e
    }
  }
}
