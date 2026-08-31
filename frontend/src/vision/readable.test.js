// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessReadability, shouldTrustDescription } from './readable'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// The flat shape classifyImage actually returns.
const frame = (meanLuma, extra = {}) => ({
  meanLuma, darkFraction: 0.2, lightFraction: 0.05, edgeDensity: 0.05, ...extra,
})

describe('frame readability', () => {
  it('passes an ordinary frame', () => {
    expect(assessReadability(frame(130)).readable).toBe(true)
  })

  it('BLOCKS a frame too dark to read, and warns on a dim one', () => {
    // Tesseract and a 256M VLM do not fail in the dark, they INVENT — and the
    // invention arrives looking exactly like a reading. "Az", "Hoag", "d ="
    // came out of an underexposed webcam frame and were reported as the
    // content of the image.
    expect(assessReadability(frame(20)).severity).toBe('block')
    expect(assessReadability(frame(50)).severity).toBe('warn')
  })

  it('says what to DO, not just what is wrong', () => {
    expect(assessReadability(frame(20)).advice).toMatch(/light|brighter/i)
    expect(assessReadability(frame(130, { edgeDensity: 0.001 })).advice).toMatch(/covered|focus/i)
  })

  it('catches bright-but-unreadable frames too', () => {
    // A mean alone cannot tell an evenly lit scene from a blown-out one, which
    // is why the luma TAILS are needed.
    expect(assessReadability(frame(200, { lightFraction: 0.9 })).readable).toBe(false)
    expect(assessReadability(frame(130, { edgeDensity: 0.001 })).readable).toBe(false)
  })

  it('does NOT block when there are no stats', () => {
    // "We could not measure" is not "it is bad". Refusing on missing data
    // would break every path that does not run imageStats first.
    expect(assessReadability({}).readable).toBe(true)
    expect(assessReadability().readable).toBe(true)
  })

  it('reads BOTH stat shapes', () => {
    // classifyImage returns flat `meanLuma`; lumaProfile returns nested
    // `luma.mean`. Reading only one is the reader/writer drift that has
    // produced a silent `undefined` repeatedly in this codebase — and here
    // undefined means "no stats", so the guard would quietly do nothing.
    expect(assessReadability({ meanLuma: 20 }).severity).toBe('block')
    expect(assessReadability({ luma: { mean: 20 } }).severity).toBe('block')
  })
})

describe('trusting the on-device description', () => {
  it('refuses a dark frame plus a scrap of OCR', () => {
    // This is the exact signature of invented text.
    const t = shouldTrustDescription({ analysis: frame(45), ocrText: 'Az Hoag d =', ocrConfidence: 22 })
    expect(t.trust).toBe(false)
    expect(t.note).toMatch(/noise|dark/i)
  })

  it('refuses low-confidence short text even on a good frame', () => {
    expect(shouldTrustDescription({ analysis: frame(140), ocrText: 'L484', ocrConfidence: 20 }).trust).toBe(false)
  })

  it('trusts a legible label and adds no scolding', () => {
    const t = shouldTrustDescription({
      analysis: frame(140),
      ocrText: 'INGREDIENTS: WATER, SUGAR, CITRIC ACID, NATURAL FLAVOUR',
      ocrConfidence: 88,
    })
    expect(t.trust).toBe(true)
    expect(t.note).toBeNull()
  })

  it('trusts plenty of confident text even from a dim frame', () => {
    // Dimness alone must not veto a reading that is plainly working, or the
    // guard becomes a nuisance and gets switched off.
    const t = shouldTrustDescription({
      analysis: frame(50),
      ocrText: 'A long and plainly legible line of real label text here',
      ocrConfidence: 75,
    })
    expect(t.trust).toBe(true)
    expect(typeof t.note).toBe('string')
  })
})

describe('wiring', () => {
  const src = fs.readFileSync(path.join(HERE, 'source.js'), 'utf8')

  it('puts the frame-quality caveat FIRST', () => {
    // A warning appended after three paragraphs of confident description does
    // not change the conclusion the model has already drawn.
    expect(src.indexOf('FRAME QUALITY:')).toBeGreaterThan(0)
    expect(src.indexOf('FRAME QUALITY:')).toBeLessThan(src.indexOf('STRUCTURE:'))
  })

  it('checks trust BEFORE the reliable-OCR branch', () => {
    // Tesseract's confidence is computed over what it thinks it saw, so noise
    // it is sure about still scores well.
    expect(src.indexOf('ocr-untrusted')).toBeLessThan(src.indexOf("sources.push('ocr')"))
  })

  it('tells the model not to interpret the noise', () => {
    expect(src).toMatch(/Do NOT repeat or interpret/)
  })
})
