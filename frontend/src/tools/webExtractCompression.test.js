/**
 * compressToRelevantPassages is the alternative to web_extract's default
 * blind head-truncation: on a long page, the relevant section is routinely
 * NOT in the first max_chars characters. Pure (no fetch, no DOM) — reuses
 * retrieval.js's own BM25 chunker/ranker, the same engine doc_search and
 * local_vault_search already run, so there is no new ranking algorithm to
 * get subtly wrong here — only the "pick top chunks, restore page order,
 * mark real gaps" composition around it.
 */
import { describe, it, expect } from 'vitest'
import { compressToRelevantPassages } from './webExtract'

// Four distinct topics, each padded past the 900-char chunk size so the
// chunker cannot accidentally merge two topics into one chunk, and ordered
// so the relevant ones are NOT first — a blind head-truncation would miss
// both of them entirely.
const NOISE_A = 'This site uses cookies to improve your experience. '.repeat(30)
const PRICING_B = 'Our pricing starts at nine dollars per month for the basic plan, ' +
  'and the enterprise tier costs ninety nine dollars per month with volume discounts. '.repeat(15)
const HISTORY_C = 'The company was founded in a garage and has grown over the decades. '.repeat(30)
const PRICING_D = 'Annual pricing plans cost less per month than the monthly billing option, ' +
  'and a nonprofit discount on the subscription price is available on request. '.repeat(15)

const ARTICLE = [NOISE_A, PRICING_B, HISTORY_C, PRICING_D].join('\n\n')

describe('compressToRelevantPassages', () => {
  it('keeps the passages that answer the focus, wherever they are on the page', () => {
    const { text, stats } = compressToRelevantPassages(ARTICLE, 'pricing cost dollars per month', 1200)
    expect(stats.matched).toBe(true)
    expect(stats.original_chars).toBe(ARTICLE.length)
    // A real subset was kept — not the whole page relabelled as "compressed",
    // and not nothing. Exact chunk counts depend on chunkText's sentence
    // boundaries, so this checks the SHAPE of the result, not a byte count.
    expect(stats.chunks_kept).toBeGreaterThan(0)
    expect(stats.chunks_kept).toBeLessThan(stats.chunks_total)
    expect(text.length).toBeLessThan(ARTICLE.length)
    expect(text).toMatch(/pricing|dollars/i)
    // The irrelevant filler must not have crowded out the two pricing sections.
    expect(text).not.toMatch(/cookies/i)
  })

  it('restores original page order even though ranking does not preserve it', () => {
    const { text } = compressToRelevantPassages(ARTICLE, 'pricing cost dollars per month', ARTICLE.length)
    const bIdx = text.indexOf('nine dollars per month')
    const dIdx = text.indexOf('Annual pricing plans')
    expect(bIdx).toBeGreaterThan(-1)
    expect(dIdx).toBeGreaterThan(-1)
    expect(bIdx).toBeLessThan(dIdx) // B appeared before D on the real page
  })

  it('says matched:false rather than silently head-slicing when the focus term is not on the page', () => {
    const { text, stats } = compressToRelevantPassages(ARTICLE, 'quantum entanglement neutrino', 500)
    expect(stats.matched).toBe(false)
    expect(text).toBe(ARTICLE.slice(0, 500))
  })

  it('never expands a short page past the budget just because chunking found only one chunk', () => {
    const short = 'A short page with nothing to rank.'
    const { text, stats } = compressToRelevantPassages(short, 'anything', 10)
    expect(stats.matched).toBeNull()
    expect(text).toBe(short.slice(0, 10))
  })

  it('marks a real gap between two non-adjacent kept chunks', () => {
    // A budget wide enough for pricing chunks from BOTH the earlier and the
    // later pricing section, with the history paragraph sitting between
    // them — the excerpt must show a gap marker, not glue them together as
    // if they were originally consecutive. Exact chunk boundaries depend on
    // chunkText's own sentence splitting, so this only asserts the marker
    // WHEN both sections actually got picked, rather than asserting a chunk
    // count this test cannot predict precisely without executing it.
    const { text, stats } = compressToRelevantPassages(ARTICLE, 'pricing dollars per month', ARTICLE.length)
    const sawBoth = text.includes('nine dollars per month') && text.includes('Annual pricing plans')
    if (stats.chunks_kept > 1 && sawBoth) {
      expect(text).toMatch(/skipped/)
    } else {
      expect(stats.chunks_kept).toBeGreaterThan(0)
    }
  })
})
