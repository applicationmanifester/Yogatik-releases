/**
 * Is this frame good enough to answer from?
 *
 * Every camera screenshot in this project is dim, and both Tesseract and a
 * 256M VLM collapse in the dark — they do not fail, they INVENT. That is where
 * "Az", "Hoag", "d =" came from: OCR noise from an underexposed webcam frame,
 * handed to the model as the content of the image, and repeated back with
 * complete confidence.
 *
 * An honest refusal beats a confident hallucination, and it is not close when
 * the subject is a pill imprint or a dosage.
 *
 * Pure — takes the numbers imageStats already computes, adds no model and no
 * canvas work of its own.
 */

/**
 * Thresholds, chosen against the failure rather than by feel:
 *  - mean luma under 60 on 0–255 is a frame where a phone camera has already
 *    given up; OCR confidence collapses well before a human calls it "dark".
 *  - a frame can be bright on average and still unreadable if it is nearly
 *    flat, which is what an out-of-focus close-up or a blown highlight looks
 *    like. Contrast catches those.
 */
export const TOO_DARK_MEAN = 60
export const VERY_DARK_MEAN = 38
export const LOW_CONTRAST_SPREAD = 28
export const MIN_EDGE_DENSITY = 0.008

/**
 * @param {object} a  from imageStats.classifyImage / analyseImage
 * @param {number} a.luma.mean       0–255
 * @param {number} [a.luma.dark]     fraction of pixels below 48
 * @param {number} [a.luma.light]    fraction above 208
 * @param {number} [a.edgeDensity]
 * @returns {{readable: boolean, reason: string|null, advice: string|null, severity: 'ok'|'warn'|'block'}}
 */
export function assessReadability(a = {}) {
  // Accept BOTH shapes. classifyImage returns flat `meanLuma` /
  // `darkFraction`, while lumaProfile returns a nested `luma` object — and
  // reading only one of them is precisely the reader/writer drift that has
  // produced a silent `undefined` four times in this codebase. Undefined here
  // would mean "no stats", so every frame would be declared readable and the
  // guard would do nothing at all.
  const mean = num(a?.luma?.mean) ?? num(a?.meanLuma)
  const dark = num(a?.luma?.dark) ?? num(a?.darkFraction)
  const light = num(a?.luma?.light) ?? num(a?.lightFraction)
  const edges = num(a?.edgeDensity)

  // No stats at all is NOT a failure — it is "we could not measure", and
  // refusing on missing data would block every path that does not run
  // imageStats first.
  if (mean == null) return ok()

  if (mean < VERY_DARK_MEAN) {
    return {
      readable: false,
      severity: 'block',
      reason: 'the frame is too dark to read',
      advice: 'Turn on a light or move somewhere brighter — I cannot make out anything in this.',
    }
  }

  if (mean < TOO_DARK_MEAN || (dark != null && dark > 0.8)) {
    return {
      readable: false,
      severity: 'warn',
      reason: 'the frame is very dark',
      advice: 'It is quite dark — I might read this wrong. More light would help.',
    }
  }

  // Blown out: a frame that is mostly white has no detail left either.
  if (light != null && light > 0.85) {
    return {
      readable: false,
      severity: 'warn',
      reason: 'the frame is overexposed',
      advice: 'That is washed out — try moving out of the direct light.',
    }
  }

  // Bright but featureless: out of focus, or the lens is covered.
  if (edges != null && edges < MIN_EDGE_DENSITY) {
    return {
      readable: false,
      severity: 'warn',
      reason: 'the frame has almost no detail',
      advice: 'I cannot make out any detail — is the camera covered, or too close to focus?',
    }
  }

  return ok()
}

const ok = () => ({ readable: true, severity: 'ok', reason: null, advice: null })
const num = (v) => (Number.isFinite(v) ? v : null)

/**
 * Should the on-device description be trusted enough to send to the model?
 *
 * Combines the frame quality with what OCR actually produced. Short, low-
 * confidence OCR from a dark frame is the exact signature of invented text,
 * and passing it on as "the content of the image" is how the model ends up
 * confidently discussing letters that were never there.
 */
export function shouldTrustDescription({ analysis, ocrText = '', ocrConfidence = null } = {}) {
  const frame = assessReadability(analysis)
  const text = String(ocrText || '').trim()

  if (frame.severity === 'block') {
    return { trust: false, note: frame.advice }
  }
  // A dim frame plus a handful of characters is noise, not a reading. The
  // length test matters: real labels produce runs of words, OCR noise produces
  // scattered fragments.
  if (!frame.readable && text.length > 0 && text.length < 25) {
    return {
      trust: false,
      note: `${frame.advice} What I could make out looks like noise rather than real text.`,
    }
  }
  if (ocrConfidence != null && ocrConfidence < 40 && text.length < 60) {
    return {
      trust: false,
      note: 'I could not read that reliably — the text came out too garbled to trust.',
    }
  }
  return { trust: true, note: frame.readable ? null : frame.advice }
}
