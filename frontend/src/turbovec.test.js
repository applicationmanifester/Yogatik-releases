import { describe, it, expect } from 'vitest'
import {
  nextPowerOfTwo,
  generateSigns,
  fastWalshHadamardTransform,
  randomizedOrthogonalRotation,
  inverseRandomizedOrthogonalRotation,
  turboQuantize,
  turboDequantize,
  turboCosineSimilarity,
  TurboVecIndex,
} from './turbovec'

describe('TurboVec Vector Quantization Engine (TurboQuant)', () => {
  function createRandomVector(dim) {
    const v = new Float32Array(dim)
    let sumSq = 0
    for (let i = 0; i < dim; i++) {
      v[i] = (Math.random() - 0.5) * 2
      sumSq += v[i] * v[i]
    }
    const norm = Math.sqrt(sumSq)
    for (let i = 0; i < dim; i++) v[i] /= norm
    return v
  }

  function trueCosineSimilarity(a, b) {
    let dot = 0
    let nA = 0
    let nB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      nA += a[i] * a[i]
      nB += b[i] * b[i]
    }
    return dot / (Math.sqrt(nA) * Math.sqrt(nB))
  }

  it('calculates next power of two correctly', () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(3)).toBe(4)
    expect(nextPowerOfTwo(384)).toBe(512)
    expect(nextPowerOfTwo(768)).toBe(1024)
    expect(nextPowerOfTwo(1536)).toBe(2048)
  })

  it('generates consistent pseudo-random sign patterns', () => {
    const signs1 = generateSigns(512, 42)
    const signs2 = generateSigns(512, 42)
    expect(signs1).toEqual(signs2)
    expect(signs1.length).toBe(512)
    for (let i = 0; i < signs1.length; i++) {
      expect(Math.abs(signs1[i])).toBe(1)
    }
  })

  it('performs orthogonal FWHT preserving vector energy', () => {
    const vec = new Float32Array([1, 0, 0, 0])
    const transformed = fastWalshHadamardTransform(new Float32Array(vec))
    let energy = 0
    for (let i = 0; i < transformed.length; i++) {
      energy += transformed[i] * transformed[i]
    }
    expect(energy).toBeCloseTo(1.0, 4)
  })

  it('round-trips randomized orthogonal rotations accurately', () => {
    const dim = 384
    const paddedDim = 512
    const vec = createRandomVector(dim)
    const signs = generateSigns(paddedDim)

    const rotated = randomizedOrthogonalRotation(vec, signs, paddedDim)
    const recovered = inverseRandomizedOrthogonalRotation(rotated, signs, dim)

    for (let i = 0; i < dim; i++) {
      expect(recovered[i]).toBeCloseTo(vec[i], 3)
    }
  })

  it('quantizes and dequantizes across 1-bit, 2-bit, 4-bit, and 8-bit modes', () => {
    const dim = 384
    const vec = createRandomVector(dim)

    // 1-bit
    const q1 = turboQuantize(vec, { bits: 1 })
    expect(q1.data.length).toBe(64) // 512 / 8

    // 2-bit
    const q2 = turboQuantize(vec, { bits: 2 })
    expect(q2.data.length).toBe(128) // 512 / 4

    // 4-bit
    const q4 = turboQuantize(vec, { bits: 4 })
    expect(q4.data.length).toBe(256) // 512 / 2

    // 8-bit
    const q8 = turboQuantize(vec, { bits: 8 })
    expect(q8.data.length).toBe(512)

    // Dequantize 4-bit and check high cosine similarity with original
    const deq4 = turboDequantize(q4)
    const sim4 = trueCosineSimilarity(vec, deq4.slice(0, dim))
    expect(sim4).toBeGreaterThan(0.75)
  })

  it('Asymmetric Distance Computation (ADC) accurately approximates true cosine similarity', () => {
    const dim = 384
    const query = createRandomVector(dim)
    const similarDoc = new Float32Array(dim)
    for (let i = 0; i < dim; i++) {
      similarDoc[i] = query[i] + (Math.random() - 0.5) * 0.2
    }

    const qTarget = turboQuantize(similarDoc, { bits: 4 })
    const trueSim = trueCosineSimilarity(query, similarDoc)
    const adcSim = turboCosineSimilarity(query, qTarget)

    expect(Math.abs(trueSim - adcSim)).toBeLessThan(0.15)
  })

  describe('TurboVecIndex', () => {
    it('indexes vectors, searches Top-K nearest neighbors, and computes memory savings', () => {
      const index = new TurboVecIndex({ dim: 384, bits: 4, name: 'docs_index' })
      const baseVec = createRandomVector(384)

      // Add identical vector
      index.addVector('exact_match', baseVec, { text: 'Exact match document' })

      // Add 10 random vectors
      for (let i = 1; i <= 10; i++) {
        index.addVector(`doc_${i}`, createRandomVector(384), { text: `Random document ${i}` })
      }

      expect(index.size).toBe(11)

      const results = index.search(baseVec, { topK: 3 })
      expect(results.length).toBe(3)
      expect(results[0].id).toBe('exact_match')
      expect(results[0].score).toBeGreaterThan(0.9)

      const stats = index.getStats()
      expect(stats.vectorCount).toBe(11)
      expect(stats.dimension).toBe(384)
      expect(stats.compressionRatio).toContain('x')
    })

    it('supports addBatch, delete, clear, and JSON serialization roundtrips', () => {
      const index = new TurboVecIndex({ dim: 128, bits: 2, name: 'batch_index' })
      const items = [
        { id: 'v1', vector: createRandomVector(128), text: 'Passage one', metadata: { category: 'ai' } },
        { id: 'v2', vector: createRandomVector(128), text: 'Passage two', metadata: { category: 'db' } },
      ]

      index.addBatch(items)
      expect(index.size).toBe(2)

      // Serialize
      const json = index.toJSON()
      expect(json.type).toBe('turbovec_index')
      expect(json.entries.length).toBe(2)

      // Deserialize
      const restored = TurboVecIndex.fromJSON(json)
      expect(restored.size).toBe(2)
      expect(restored.entries.get('v1').text).toBe('Passage one')

      // Delete & Clear
      restored.delete('v1')
      expect(restored.size).toBe(1)
      restored.clear()
      expect(restored.size).toBe(0)
    })
  })
})
