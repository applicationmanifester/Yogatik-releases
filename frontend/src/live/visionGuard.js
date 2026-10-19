/**
 * Honest refusal for unreadable frames (LIVE_ROADMAP Horizon 1b).
 *
 * Both OCR and small VLMs collapse in the dark — they do not fail, they
 * INVENT. This reuses vision/readable.js as the single judge: when the frame
 * is unreadable, the caveat goes FIRST, ahead of anything derived from the
 * pixels, and OCR from a bad frame is labelled noise the model must not
 * interpret. Pure — takes analysis numbers, no canvas, no model.
 */
import { assessReadability, shouldTrustDescription } from '../vision/readable'

/**
 * @param {object|null} analysis from imageStats.classifyImage / analyseImage
 * @param {{ ocrText?: string, ocrConfidence?: number|null }} [ocr]
 * @returns {string|null} the honest refusal to say instead of guessing, or
 *   null when the frame is fine to answer from.
 */
export function honestFrameNote(analysis, { ocrText = '', ocrConfidence = null } = {}) {
  if (!analysis) return null   // could not measure — not a failure, don't block
  const frame = assessReadability(analysis)
  if (frame.readable) {
    // Readable frame, but garbage OCR is still garbage: refuse that too.
    const { trust, note } = shouldTrustDescription({ analysis, ocrText, ocrConfidence })
    return trust ? null : (note || 'I could not read that reliably.')
  }
  // Unreadable frame: the caveat is the WHOLE answer, first and only.
  const { note } = shouldTrustDescription({ analysis, ocrText, ocrConfidence })
  return note || frame.advice || 'I cannot make that out from this frame.'
}
