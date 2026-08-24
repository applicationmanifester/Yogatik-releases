// @vitest-environment node
/**
 * Deciding WHICH strings from an image are worth searching for.
 *
 * This is the half that answers "what series is this". Reading the image
 * better was never going to: the series name is on the internet, not in a
 * frame showing an episode number and a timestamp. So the quality of the
 * extraction is the quality of the answer, and a bad query is invisible —
 * it just comes back with nothing and looks like the model failing.
 */
import { describe, it, expect } from 'vitest'
import { extractIdentifiers, buildQueries, searchHint } from './identify'

describe('extractIdentifiers', () => {
  it('keeps a title line whole rather than shredding it into tokens', () => {
    // "The Expanse" split into two tokens is two useless queries.
    const ids = extractIdentifiers({ ocr: 'The Expanse\nS03E07' })
    expect(ids[0].text).toBe('The Expanse')
    expect(ids[0].kind).toBe('title')
  })

  it('drops player chrome, timecodes and bare numbers', () => {
    // This is the actual content of the screenshot that started this: an
    // episode marker and UI furniture, nothing identifying.
    const ids = extractIdentifiers({ ocr: '10 » | 41\nPLAY\n12:34\n0:00 / 41:20' })
    expect(ids.map(i => i.text)).not.toContain('PLAY')
    expect(ids.some(i => /^\d/.test(i.text))).toBe(false)
  })

  it('returns nothing searchable when the image holds nothing searchable', () => {
    // The honest outcome, and the one that lets identify say so plainly
    // instead of searching for "41" and reporting confident nonsense.
    expect(extractIdentifiers({ ocr: '10 » | 41 PLEY' })).toEqual([])
  })

  it('picks out product-like names', () => {
    const ids = extractIdentifiers({ ocr: 'installed NVIDIA CUDA toolkit' })
    expect(ids.some(i => i.text === 'NVIDIA' && i.kind === 'name')).toBe(true)
  })

  it('does not repeat the same string twice', () => {
    const ids = extractIdentifiers({ ocr: 'Blade Runner\nBlade Runner' })
    expect(ids.filter(i => i.text === 'Blade Runner')).toHaveLength(1)
  })

  it('ranks a title above a category guess', () => {
    const ids = extractIdentifiers({
      ocr: 'Better Call Saul',
      labels: [{ label: 'a screenshot of a video player or streaming service', score: 0.9 }],
    })
    expect(ids[0].kind).toBe('title')
  })
})

describe('buildQueries', () => {
  it('qualifies the query with what the user actually asked', () => {
    // The single most valuable signal, and one no image analysis can supply.
    const ids = extractIdentifiers({ ocr: 'The Expanse' })
    expect(buildQueries(ids, 'tv series')).toEqual(['The Expanse tv series'])
  })

  it('caps how many searches one image can trigger', () => {
    const ids = extractIdentifiers({ ocr: 'Alpha Bravo\nCharlie Delta\nEcho Foxtrot\nGolf Hotel' })
    expect(buildQueries(ids, '', 3).length).toBeLessThanOrEqual(3)
  })

  it('falls back to the category when nothing else is distinctive', () => {
    const ids = extractIdentifiers({ labels: [{ label: 'a photograph of food', score: 0.8 }] })
    expect(buildQueries(ids, '')).toEqual(['a photograph of food'])
  })

  it('produces no query at all rather than a meaningless one', () => {
    expect(buildQueries(extractIdentifiers({ ocr: '10 » | 41 PLEY' }), 'tv series')).toEqual([])
  })
})

describe('searchHint', () => {
  it('reads the kind of thing out of the question', () => {
    expect(searchHint('what series is this')).toBe('tv series')
    expect(searchHint('which movie is this from?')).toBe('movie')
    expect(searchHint('what plant is this')).toBe('plant species')
  })

  it('is empty when the question names no category', () => {
    expect(searchHint('what is this')).toBe('')
    expect(searchHint('')).toBe('')
  })
})
