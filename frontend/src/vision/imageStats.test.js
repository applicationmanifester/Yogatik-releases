// @vitest-environment node
/**
 * The free half of image understanding — no model, no download, no network.
 *
 * This is what was missing when a dark-mode video-player screenshot reached
 * the model as the string "10 » | 41 PLEY". Nothing in the pipeline had looked
 * at the picture; only Tesseract had, at the wrong scale and the wrong
 * polarity, and its garbage was passed off as the image's content.
 *
 * Pure maths over an RGBA array, so it runs with no browser.
 */
import { describe, it, expect } from 'vitest'
import {
  luminance, lumaProfile, colourCount, edgeDensity, textBands,
  dominantColours, classifyImage, describeStructure,
} from './imageStats'
import {
  toGrayscale, invert, stretchContrast, adaptiveThreshold,
} from './preprocess'

/** Build an RGBA buffer from a per-pixel painter. */
function image(width, height, paint) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      const i = (y * width + x) * 4
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
    }
  }
  return { rgba, width, height }
}

/** A photo: smooth gradients, thousands of colours. */
const photo = (w = 120, h = 90) => image(w, h, (x, y) => [
  (x * 2 + y) % 256,
  (y * 3 + x * 2) % 256,
  (x * y) % 256,
])

/** A dark UI: near-black background, a few flat panels, bright text rows. */
const darkUi = (w = 160, h = 90) => image(w, h, (x, y) => {
  if (y > h - 20 && y < h - 10 && x % 7 < 4) return [235, 235, 235]   // text band
  if (y > h - 26) return [30, 30, 34]                                  // control bar
  return [12, 12, 16]
})

/** A document: white page, several rows of dark ink. */
const document_ = (w = 160, h = 120) => image(w, h, (x, y) => {
  const inRow = [20, 45, 70, 95].some(top => y >= top && y < top + 8)
  return inRow && x % 5 < 3 ? [25, 25, 25] : [250, 250, 248]
})

describe('luminance and profile', () => {
  it('weights green the way every codec does', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(76.245, 1)
    expect(luminance(0, 255, 0)).toBeCloseTo(149.685, 1)
    expect(luminance(255, 255, 255)).toBeCloseTo(255, 1)
  })

  it('reports how much of the image is very dark or very light', () => {
    const dark = lumaProfile(darkUi().rgba)
    expect(dark.mean).toBeLessThan(90)
    expect(dark.dark).toBeGreaterThan(0.6)

    const page = lumaProfile(document_().rgba)
    expect(page.light).toBeGreaterThan(0.6)
  })
})

describe('colourCount', () => {
  it('separates a photograph from an interface', () => {
    // This single number carries most of the classification.
    expect(colourCount(photo().rgba)).toBeGreaterThan(1000)
    expect(colourCount(darkUi().rgba)).toBeLessThan(50)
  })
})

describe('edgeDensity', () => {
  it('is high for drawn UI and low for a smooth gradient', () => {
    const ui = darkUi()
    const smooth = image(120, 90, (x) => [x * 2 % 256, x * 2 % 256, x * 2 % 256])
    expect(edgeDensity(ui.rgba, ui.width, ui.height))
      .toBeGreaterThan(edgeDensity(smooth.rgba, smooth.width, smooth.height))
  })
})

describe('textBands', () => {
  it('finds the rows that hold text on a light page', () => {
    const d = document_()
    const bands = textBands(d.rgba, d.width, d.height)
    expect(bands.length).toBeGreaterThanOrEqual(3)
  })

  it('finds light-on-dark text too', () => {
    // The band detector compares each row against its OWN background, so it
    // works on a dark theme. Keying it on absolute darkness would have found
    // nothing in the screenshot that started all this.
    const ui = darkUi()
    const bands = textBands(ui.rgba, ui.width, ui.height)
    expect(bands.length).toBeGreaterThanOrEqual(1)
  })
})

describe('classifyImage', () => {
  it('calls a gradient-rich image a photo', () => {
    expect(classifyImage(photo()).kind).toBe('photo')
  })

  it('calls a dark flat-colour screenshot a UI, and notices the dark theme', () => {
    const a = classifyImage(darkUi())
    expect(a.kind).toBe('ui')
    expect(a.darkMode).toBe(true)
  })

  it('calls a light page of text a document', () => {
    expect(classifyImage(document_()).kind).toBe('document')
  })

  it('describes itself in a sentence a model can use', () => {
    const text = describeStructure(classifyImage(darkUi()))
    expect(text).toMatch(/user interface/i)
    expect(text).toMatch(/dark theme/i)
    expect(text).toMatch(/160x90/)
  })
})

describe('dominantColours', () => {
  it('reports the palette an interface is drawn from', () => {
    const top = dominantColours(darkUi().rgba)
    expect(top.length).toBeGreaterThan(0)
    expect(top[0].share).toBeGreaterThan(0.4)
    expect(top[0].hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('preprocessing maths', () => {
  it('grayscale collapses the channels', () => {
    const a = new Uint8ClampedArray([255, 0, 0, 255])
    toGrayscale(a)
    expect(a[0]).toBe(a[1])
    expect(a[1]).toBe(a[2])
  })

  it('invert is its own inverse', () => {
    const a = new Uint8ClampedArray([10, 20, 30, 255])
    invert(invert(a))
    expect([...a.slice(0, 3)]).toEqual([10, 20, 30])
  })

  it('contrast stretching pushes a flat range to the full scale', () => {
    // A low-contrast grey band, exactly what UI chrome looks like.
    const { rgba } = image(40, 10, (x) => { const v = 100 + (x % 20); return [v, v, v] })
    stretchContrast(rgba)
    const after = lumaProfile(rgba)
    expect(after.dark + after.light).toBeGreaterThan(0.1)
  })

  it('adaptive thresholding keeps both halves of a split-brightness image', () => {
    // A single global threshold turns one half solid black — the exact failure
    // on a screenshot with a light panel beside a dark one.
    const w = 40
    const h = 20
    const { rgba } = image(w, h, (x, y) => {
      const bg = x < w / 2 ? 230 : 40
      const ink = x < w / 2 ? 60 : 210
      return (y % 6 === 0) ? [ink, ink, ink] : [bg, bg, bg]
    })
    toGrayscale(rgba)
    adaptiveThreshold(rgba, w, h)
    let black = 0
    let white = 0
    for (let i = 0; i < rgba.length; i += 4) (rgba[i] < 128 ? black++ : white++)
    expect(black).toBeGreaterThan(0)
    expect(white).toBeGreaterThan(0)
  })
})
