import { describe, it, expect } from 'vitest'
import { isImageFile, imageFromClipboard, imageFromDrop } from './attach'

const file = (type, name = 'f') => ({ type, name })

describe('attachment routing', () => {
  it('treats real image types as images', () => {
    expect(isImageFile(file('image/png'))).toBe(true)
    expect(isImageFile(file('image/jpeg'))).toBe(true)
    expect(isImageFile(file('image/webp'))).toBe(true)
  })

  it('does not send documents down the vision path', () => {
    // A PDF has no pixels for OCR here; it belongs to extractText + BM25.
    expect(isImageFile(file('application/pdf'))).toBe(false)
    expect(isImageFile(file('text/plain'))).toBe(false)
    expect(isImageFile(null)).toBe(false)
    expect(isImageFile(undefined)).toBe(false)
  })
})

describe('clipboard and drop', () => {
  it('picks the image out of a paste that also carries text', () => {
    const png = file('image/png')
    const event = {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => png },
        ],
      },
    }
    expect(imageFromClipboard(event)).toBe(png)
  })

  it('returns null for a text-only paste, so typing is untouched', () => {
    const event = { clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] } }
    expect(imageFromClipboard(event)).toBeNull()
  })

  it('survives a paste event with no clipboard data at all', () => {
    expect(imageFromClipboard({})).toBeNull()
  })

  it('finds the first image among dropped files', () => {
    const jpg = file('image/jpeg')
    const event = { dataTransfer: { files: [file('application/zip'), jpg] } }
    expect(imageFromDrop(event)).toBe(jpg)
  })

  it('returns null when a drop has no image, leaving the file path to handle it', () => {
    expect(imageFromDrop({ dataTransfer: { files: [file('text/csv')] } })).toBeNull()
    expect(imageFromDrop({})).toBeNull()
  })
})
