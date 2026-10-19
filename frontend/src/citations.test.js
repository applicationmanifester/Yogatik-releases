import { describe, it, expect } from 'vitest'
import {
  RRF_K, CITE_INSTRUCTION, fuse, withCitationIds,
  extractCitations, buildSourcesStrip,
} from './citations'

const row = (name, extra = {}) => ({ name, id: name, ...extra })

describe('fuse — RRF rank fusion (k=60)', () => {
  it('agrees in both lists: a row ranked well twice rises to the top', () => {
    const a = [row('A'), row('B'), row('C')]
    const b = [row('B'), row('D')]
    const fused = fuse(a, b)
    // B leads (double hit). A = 1/61 beats D = 1/62 (b-rank 1) beats C = 1/63.
    expect(fused.map(r => r.name)).toEqual(['B', 'A', 'D', 'C'])
    expect(fused[0].rrfScore).toBeCloseTo(1 / (RRF_K + 0 + 1) + 1 / (RRF_K + 1 + 1), 12)
  })

  it('scores exactly Σ 1/(k + rank + 1) over the lists a row appears in', () => {
    const a = [row('A'), row('B')]
    const b = [row('A')]
    const fused = fuse(a, b)
    expect(fused[0].name).toBe('A')
    expect(fused[0].rrfScore).toBeCloseTo(1 / (RRF_K + 0 + 1) + 1 / (RRF_K + 0 + 1), 12)
    expect(fused[1].name).toBe('B')
    expect(fused[1].rrfScore).toBeCloseTo(1 / (RRF_K + 1 + 1), 12)
  })

  it('breaks exact score ties by the best position the row was seen at, then appearance order', () => {
    // Disjoint lists: each list's 1st-place row scores 1/61 and each list's
    // 2nd-place 1/62 — so A ties C and B ties D; best rank is tied too, so
    // stable appearance order decides.
    const a = [row('A'), row('B')]
    const c = [row('C'), row('D')]
    const fused = fuse(a, c)
    // A and C both score 1/61; both best-rank 0; appearance order settles it.
    // B and D both score 1/62 and tie the same way.
    expect(fused.map(r => r.name)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('is graceful when one engine has no results — fused is simply that list', () => {
    const a = [row('A'), row('B'), row('C')]
    expect(fuse(a, []).map(r => r.name)).toEqual(['A', 'B', 'C'])
    expect(fuse([], a).map(r => r.name)).toEqual(['A', 'B', 'C'])
    expect(fuse(a, undefined).map(r => r.name)).toEqual(['A', 'B', 'C'])
    // Scores stay monotone down the passthrough order.
    const passthrough = fuse(a, [])
    expect(passthrough[0].rrfScore).toBeGreaterThan(passthrough[1].rrfScore)
    expect(passthrough[1].rrfScore).toBeGreaterThan(passthrough[2].rrfScore)
  })

  it('both lists empty (or not arrays) → empty, never a crash', () => {
    expect(fuse([], [])).toEqual([])
    expect(fuse(undefined, null)).toEqual([])
  })

  it('dedupes the same chunk repeated across engines instead of double-counting it, and preserves row fields', () => {
    // Cloned objects with the same content must collapse to ONE fused row.
    const a = [{ text: 'leave is 18 days', score: 12.5 }, row('B')]
    const b = [{ text: 'leave is 18 days', score: 0.9 }]
    const fused = fuse(a, b)
    expect(fused).toHaveLength(2)
    expect(fused[0].text).toBe('leave is 18 days')
    // The first list's row object wins the field race — scores come from BM25.
    expect(fused[0].score).toBe(12.5)
  })

  it('does not mutate the input rows', () => {
    const a = [row('A', { score: 3 }), row('B')]
    const b = [row('B', { score: 0.4 }), row('A')]
    const aClone = JSON.parse(JSON.stringify(a))
    const bClone = JSON.parse(JSON.stringify(b))
    fuse(a, b)
    expect(a).toEqual(aClone)
    expect(b).toEqual(bClone)
  })

  it('honours a custom k (smaller k widens rank differences)', () => {
    const a = [row('A'), row('B')]
    const fused = fuse(a, [], { k: 0 }) // invalid → falls back to RRF_K
    expect(fused[0].rrfScore).toBeCloseTo(1 / (RRF_K + 1), 12)
    const tight = fuse([row('A')], [], { k: 1 })
    expect(tight[0].rrfScore).toBeCloseTo(1 / 2, 12)
  })
})

describe('withCitationIds — stable [1]..[n]', () => {
  it('numbers the fused order best-first and overwrites stale ns', () => {
    const out = withCitationIds([{ name: 'B', n: 99 }, { name: 'A' }, { name: 'C' }])
    expect(out.map(r => r.n)).toEqual([1, 2, 3])
    expect(out.map(r => r.name)).toEqual(['B', 'A', 'C'])
  })

  it('handles null/empty input', () => {
    expect(withCitationIds(null)).toEqual([])
    expect(withCitationIds([])).toEqual([])
  })

  it('fuse → ids is the single chain the tool row numbering follows', () => {
    const fused = fuse([row('x'), row('y')], [row('y')])
    const numbered = withCitationIds(fused)
    expect(numbered.map(r => r.n)).toEqual([1, 2])
  })
})

describe('extractCitations — the answer-side forms', () => {
  it('reads [1] style', () => {
    expect(extractCitations('The fee is waived [1]. Later parts differ [3].')).toEqual([1, 3])
  })

  it('reads [2,3] and [4, 5] lists', () => {
    expect(extractCitations('per [2,3] docs and [4, 5]')).toEqual([2, 3, 4, 5])
  })

  it('reads [citation:1] and spaced variants', () => {
    expect(extractCitations('per [citation:1]')).toEqual([1])
    expect(extractCitations('per [citation: 2, 3]')).toEqual([2, 3])
  })

  it('dedupes across the whole answer and sorts ascending', () => {
    expect(extractCitations('[3] [1] [3] [citation:1]')).toEqual([1, 3])
  })

  it('ignores bracketed numbers inside code', () => {
    expect(extractCitations('use `arr[2]` here:\n\n```\nrows[4]\n[a, 5]\n```\nand truly [2] only')).toEqual([2])
  })

  it('ignores footnote/link definitions but keeps inline citations', () => {
    const text = 'as shown [1]\n\n[1]: https://example.com/source'
    expect(extractCitations(text)).toEqual([1])
  })

  it('a numeric markdown-link label is a citation; a prose label is not', () => {
    expect(extractCitations('full report [2](https://example.com/report.pdf) and [leave policy](https://x.com)')).toEqual([2])
  })

  it('rejects non-numeric, zero, and absurd ids', () => {
    expect(extractCitations('zero [0], negative [-1], huge [12345], word [leave]')).toEqual([])
  })

  it('returns [] gracefully for empty/null input', () => {
    expect(extractCitations('')).toEqual([])
    expect(extractCitations(null)).toEqual([])
  })
})

describe('buildSourcesStrip — the strip data structure', () => {
  const toolRows = [
    { n: 1, document: 'Handbook.pdf', passage: 'Full-time employees accrue 18 days of paid annual leave per year.', chunk: 2, of: 9, score: 1.23456 },
    { n: 2, document: 'Travel policy', passage: 'Travel expenses must be filed within 30 days of the trip.  '.trim(), chunk: 1, of: 4, score: 0.9876 },
    { n: 3, document: 'Handbook.pdf', passage: 'The notice period is 60 days for senior roles.', chunk: 5, of: 9, score: 0.712 },
  ]

  it('pairs each cited number with its row: {n, docName, chunk, preview, score}', () => {
    const strip = buildSourcesStrip('Leave accrues at 18 days [1]; filing is due in 30 days [2].', toolRows)
    expect(strip).not.toBeNull()
    expect(strip.count).toBe(2)
    expect(strip.items[0]).toMatchObject({
      n: 1, docName: 'Handbook.pdf', chunk: 2, of: 9, score: 1.23,
      preview: 'Full-time employees accrue 18 days of paid annual leave per year.',
    })
    expect(strip.items[1]).toMatchObject({ n: 2, docName: 'Travel policy', score: 0.99 })
  })

  it('items are ascending by cited n and skip rows the answer never cited', () => {
    const strip = buildSourcesStrip('covered [2,1]', toolRows)
    expect(strip.items.map(i => i.n)).toEqual([1, 2])
    expect(strip.items.some(i => i.n === 3)).toBe(false)
  })

  it('truncates long passages with an ellipsis and flattened whitespace', () => {
    const rows = [{ n: 1, document: 'D', passage: `word ${'x'.repeat(300)} end` }]
    const strip = buildSourcesStrip('see [1]', rows)
    expect(strip.items[0].preview.length).toBeLessThanOrEqual(160)
    expect(strip.items[0].preview.endsWith('…')).toBe(true)
    expect(strip.items[0].preview.includes('\n')).toBe(false)
  })

  it('legacy rows stored before numbering fall back to list position', () => {
    const legacy = [
      { document: 'Old.pdf', passage: 'row one', score: 2 },
      { document: 'Old.docx', passage: 'row two', score: 1 },
    ]
    const strip = buildSourcesStrip('cites [2]', legacy)
    expect(strip.items).toEqual([{ n: 2, docName: 'Old.docx', chunk: undefined, of: undefined, preview: 'row two', score: 1 }])
  })

  it('hides: no citations in the answer → null', () => {
    expect(buildSourcesStrip('The handbook covers leave and expenses.', toolRows)).toBeNull()
  })

  it('hides: citations the tool never returned → null', () => {
    expect(buildSourcesStrip('made up [7]', toolRows)).toBeNull()
  })

  it('hides: no rows at all (or malformed rows) → null', () => {
    expect(buildSourcesStrip('see [1]', [])).toBeNull()
    expect(buildSourcesStrip('see [1]', undefined)).toBeNull()
    expect(buildSourcesStrip('see [1]', [null, 'oops', 42])).toBeNull()
  })

  it('works end-to-end from the fusion chain the tool path uses', () => {
    const numbered = withCitationIds(fuse(
      [{ passage: 'bm25 winner about leave', score: 9, document: 'A.pdf' }],
      [{ passage: 'also about leave', score: 0.9, document: 'B.pdf' }],
    ))
    const strip = buildSourcesStrip('leave is covered [1]', numbered)
    expect(strip.count).toBe(1)
    expect(strip.items[0].docName).toBe('A.pdf')
  })
})

describe('CITE_INSTRUCTION — the one appended model-facing line', () => {
  it('is the exact instruction doc_search appends to its result', () => {
    expect(CITE_INSTRUCTION).toBe('When using these results, cite the bracketed number, e.g. [1].')
  })
})
