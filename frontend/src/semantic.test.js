import { describe, it, expect } from 'vitest'
import {
  semanticRerank,
  rrfFuse,
  quantizeVector,
  dequantizeVector,
  quantizedCosineSimilarity,
} from './semantic'

describe('Vector Quantization', () => {
  it('quantizes and dequantizes a vector with minimal reconstruction error', () => {
    const original = [0.1, -0.5, 0.8, -0.2, 0.0, 0.95, -0.95]
    const quantized = quantizeVector(original)

    expect(quantized.data).toBeInstanceOf(Int8Array)
    expect(quantized.data.length).toBe(original.length)

    const reconstructed = dequantizeVector(quantized)
    for (let i = 0; i < original.length; i++) {
      // Reconstruction error should be less than 1% of dynamic range (1/255)
      expect(Math.abs(reconstructed[i] - original[i])).toBeLessThan(0.02)
    }
  })

  it('calculates quantized cosine similarity accurately', () => {
    const vecA = [1, 0, 0, 0]
    const vecB = [1, 0, 0, 0]
    const vecC = [0, 1, 0, 0]

    const qA = quantizeVector(vecA)
    const qB = quantizeVector(vecB)
    const qC = quantizeVector(vecC)

    const simAB = quantizedCosineSimilarity(qA, qB)
    const simAC = quantizedCosineSimilarity(qA, qC)

    expect(simAB).toBeGreaterThan(0.98) // Identical directions -> ~1.0
    expect(simAC).toBeLessThan(0.05) // Orthogonal directions -> ~0.0
  })

  it('handles empty vector inputs gracefully', () => {
    const emptyQ = quantizeVector([])
    expect(emptyQ.data.length).toBe(0)
    expect(dequantizeVector(emptyQ).length).toBe(0)
    expect(quantizedCosineSimilarity(emptyQ, emptyQ)).toBe(0)
  })
})

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
