import { describe, it, expect } from 'vitest'
import { semanticRerank, rrfFuse } from './semantic'

// The model is never loaded in the test env (no consent, no cache, no network),
// so semanticRerank must fall back to BM25 order — callers rely on this.
describe('semanticRerank fallback', () => {
  it('returns items in BM25 order, capped at topK, when the model is unavailable', async () => {
    const items = [
      { text: 'gamma', score: 1 },
      { text: 'alpha', score: 3 },
      { text: 'beta', score: 2 },
    ]
    const out = await semanticRerank('anything', items, 2)
    expect(out).toHaveLength(2)
    // Input order is preserved on fallback (caller pre-sorts by BM25).
    expect(out.map(i => i.text)).toEqual(['gamma', 'alpha'])
  })

  it('handles empty input', async () => {
    expect(await semanticRerank('q', [], 5)).toEqual([])
    expect(await semanticRerank('', [{ text: 'x' }], 5)).toEqual([{ text: 'x' }])
  })
})

describe('rrfFuse', () => {
  it('promotes an item both systems rank highly over a BM25-only top hit', () => {
    // BM25 order: A,B,C. Semantic order: B,C,A (A is a keyword-only match).
    const items = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
    const sims = [0.1, 0.9, 0.8] // A low, B/C high
    const out = rrfFuse(items, sims, 3)
    expect(out[0].id).toBe('B') // agreed-strong beats keyword-only A
  })
})
