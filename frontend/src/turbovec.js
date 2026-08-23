/**
 * TurboVec: Browser-Native TurboQuant Vector Quantization & Search Engine
 * 
 * Based on TurboQuant (Google Research, ICLR 2026) and TurboVec (RyanCodrai/turbovec).
 * Provides data-oblivious vector quantization with zero training phase, instant online ingestion,
 * and up to 32x memory compression via Fast Walsh-Hadamard Transforms (FWHT) + Bitpacked Quantization.
 */

/**
 * Finds next power of 2 for Fast Walsh-Hadamard Transform (FWHT)
 */
export function nextPowerOfTwo(n) {
  if (n <= 1) return 1
  return 1 << (32 - Math.clz32(n - 1))
}

/**
 * Deterministic pseudo-random sign array generator for orthogonal rotation.
 * Acts as the diagonal matrix D with entries +/- 1.
 */
export function generateSigns(dim, seed = 1337) {
  const signs = new Float32Array(dim)
  let s = seed
  for (let i = 0; i < dim; i++) {
    // Simple LCG
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    signs[i] = (s & 1) === 1 ? 1 : -1
  }
  return signs
}

/**
 * In-place Fast Walsh-Hadamard Transform (FWHT) on power-of-2 array.
 * Normalizes vector energy evenly across all coordinates.
 */
export function fastWalshHadamardTransform(arr) {
  const n = arr.length
  let h = 1
  while (h < n) {
    for (let i = 0; i < n; i += h * 2) {
      for (let j = i; j < i + h; j++) {
        const u = arr[j]
        const v = arr[j + h]
        arr[j] = u + v
        arr[j + h] = u - v
      }
    }
    h *= 2
  }
  // Normalization factor 1 / sqrt(n)
  const normFactor = 1 / Math.sqrt(n)
  for (let i = 0; i < n; i++) {
    arr[i] *= normFactor
  }
  return arr
}

/**
 * Randomized Orthogonal Transformation (HD): applies sign flip then FWHT.
 */
export function randomizedOrthogonalRotation(vec, signs, targetDim) {
  const out = new Float32Array(targetDim)
  const len = Math.min(vec.length, targetDim)
  for (let i = 0; i < len; i++) {
    out[i] = vec[i] * (signs ? signs[i] : 1)
  }
  return fastWalshHadamardTransform(out)
}

/**
 * Inverse Randomized Orthogonal Transformation (DH): applies FWHT then sign flip.
 */
export function inverseRandomizedOrthogonalRotation(rotated, signs, origDim) {
  const copy = new Float32Array(rotated)
  fastWalshHadamardTransform(copy)
  const out = new Float32Array(origDim)
  const len = Math.min(origDim, copy.length)
  for (let i = 0; i < len; i++) {
    out[i] = copy[i] * (signs ? signs[i] : 1)
  }
  return out
}

/* =========================================================================
   Bit-Packing & Quantization Modes (1-bit, 2-bit, 4-bit, 8-bit)
   ========================================================================= */

/**
 * Quantize rotated vector to specified bit width (1, 2, 4, or 8 bits per dimension).
 * 
 * @param {Float32Array | number[]} vec
 * @param {Object} options
 * @param {1 | 2 | 4 | 8} [options.bits=4]
 * @param {Float32Array} [options.signs]
 * @returns {QuantizedVector}
 */
export function turboQuantize(vec, { bits = 4, signs = null } = {}) {
  if (!vec || !vec.length) {
    return { data: new Uint8Array(0), bits, origDim: 0, paddedDim: 0, min: 0, scale: 1, norm: 0 }
  }

  const origDim = vec.length
  const paddedDim = nextPowerOfTwo(origDim)
  const rotSigns = signs || generateSigns(paddedDim)
  const rotated = randomizedOrthogonalRotation(vec, rotSigns, paddedDim)

  let normSq = 0
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < paddedDim; i++) {
    const val = rotated[i]
    normSq += val * val
    if (val < min) min = val
    if (val > max) max = val
  }
  const norm = Math.sqrt(normSq)

  if (bits === 1) {
    // 1-bit quantization (sign bit packing: 8 entries per byte)
    const byteCount = Math.ceil(paddedDim / 8)
    const data = new Uint8Array(byteCount)
    for (let i = 0; i < paddedDim; i++) {
      if (rotated[i] >= 0) {
        data[i >> 3] |= (1 << (i & 7))
      }
    }
    return { data, bits: 1, origDim, paddedDim, min: -1, scale: 2, norm }
  }

  if (bits === 2) {
    // 2-bit quantization (4 levels, 4 entries per byte)
    const numLevels = 4
    const range = max - min
    const scale = range === 0 ? 1 : range / (numLevels - 1)
    const byteCount = Math.ceil(paddedDim / 4)
    const data = new Uint8Array(byteCount)

    for (let i = 0; i < paddedDim; i++) {
      const q = Math.max(0, Math.min(numLevels - 1, Math.round((rotated[i] - min) / scale)))
      const byteIdx = i >> 2
      const shift = (i & 3) * 2
      data[byteIdx] |= (q << shift)
    }
    return { data, bits: 2, origDim, paddedDim, min, scale, norm }
  }

  if (bits === 4) {
    // 4-bit quantization (16 levels, 2 entries per byte)
    const numLevels = 16
    const range = max - min
    const scale = range === 0 ? 1 : range / (numLevels - 1)
    const byteCount = Math.ceil(paddedDim / 2)
    const data = new Uint8Array(byteCount)

    for (let i = 0; i < paddedDim; i++) {
      const q = Math.max(0, Math.min(numLevels - 1, Math.round((rotated[i] - min) / scale)))
      const byteIdx = i >> 1
      if ((i & 1) === 0) {
        data[byteIdx] |= (q & 0x0F)
      } else {
        data[byteIdx] |= ((q & 0x0F) << 4)
      }
    }
    return { data, bits: 4, origDim, paddedDim, min, scale, norm }
  }

  // Default: 8-bit quantization (256 levels, 1 entry per byte)
  const numLevels = 256
  const range = max - min
  const scale = range === 0 ? 1 : range / (numLevels - 1)
  const data = new Uint8Array(paddedDim)

  for (let i = 0; i < paddedDim; i++) {
    const q = Math.max(0, Math.min(numLevels - 1, Math.round((rotated[i] - min) / scale)))
    data[i] = q
  }
  return { data, bits: 8, origDim, paddedDim, min, scale, norm }
}

/**
 * Dequantize TurboQuant representation back to float vector.
 */
export function turboDequantize(qVec, { signs = null } = {}) {
  if (!qVec?.data?.length) return new Float32Array(0)
  const { data, bits, origDim, paddedDim, min, scale } = qVec
  const rotated = new Float32Array(paddedDim)

  if (bits === 1) {
    for (let i = 0; i < paddedDim; i++) {
      const bit = (data[i >> 3] >> (i & 7)) & 1
      rotated[i] = bit === 1 ? 1 : -1
    }
  } else if (bits === 2) {
    for (let i = 0; i < paddedDim; i++) {
      const byteVal = data[i >> 2]
      const shift = (i & 3) * 2
      const q = (byteVal >> shift) & 3
      rotated[i] = (q * scale) + min
    }
  } else if (bits === 4) {
    for (let i = 0; i < paddedDim; i++) {
      const byteVal = data[i >> 1]
      const q = (i & 1) === 0 ? (byteVal & 0x0F) : ((byteVal >> 4) & 0x0F)
      rotated[i] = (q * scale) + min
    }
  } else {
    for (let i = 0; i < paddedDim; i++) {
      rotated[i] = (data[i] * scale) + min
    }
  }

  const rotSigns = signs || generateSigns(paddedDim)
  return inverseRandomizedOrthogonalRotation(rotated, rotSigns, origDim)
}

/**
 * Asymmetric Distance Computation (ADC):
 * Computes cosine similarity between an unquantized query vector and a TurboQuant vector.
 * The query is rotated with full precision, allowing fast dot product with quantized codes.
 */
export function turboCosineSimilarity(queryVec, qVec, { signs = null } = {}) {
  if (!queryVec?.length || !qVec?.data?.length) return 0
  const { data, bits, paddedDim, min, scale, norm: targetNorm } = qVec

  let qNormSq = 0
  for (let i = 0; i < queryVec.length; i++) {
    qNormSq += queryVec[i] * queryVec[i]
  }
  const queryNorm = Math.sqrt(qNormSq)
  if (queryNorm === 0 || targetNorm === 0) return 0

  const rotSigns = signs || generateSigns(paddedDim)
  const qRotated = randomizedOrthogonalRotation(queryVec, rotSigns, paddedDim)

  let dotProduct = 0

  if (bits === 1) {
    for (let i = 0; i < paddedDim; i++) {
      const bit = (data[i >> 3] >> (i & 7)) & 1
      const val = bit === 1 ? 1 : -1
      dotProduct += qRotated[i] * val
    }
  } else if (bits === 2) {
    let intSum = 0
    let qSum = 0
    for (let i = 0; i < paddedDim; i++) {
      const byteVal = data[i >> 2]
      const shift = (i & 3) * 2
      const q = (byteVal >> shift) & 3
      intSum += qRotated[i] * q
      qSum += qRotated[i]
    }
    dotProduct = (scale * intSum) + (min * qSum)
  } else if (bits === 4) {
    let intSum = 0
    let qSum = 0
    for (let i = 0; i < paddedDim; i++) {
      const byteVal = data[i >> 1]
      const q = (i & 1) === 0 ? (byteVal & 0x0F) : ((byteVal >> 4) & 0x0F)
      intSum += qRotated[i] * q
      qSum += qRotated[i]
    }
    dotProduct = (scale * intSum) + (min * qSum)
  } else {
    let intSum = 0
    let qSum = 0
    for (let i = 0; i < paddedDim; i++) {
      intSum += qRotated[i] * data[i]
      qSum += qRotated[i]
    }
    dotProduct = (scale * intSum) + (min * qSum)
  }

  return dotProduct / (queryNorm * targetNorm)
}

/* =========================================================================
   TurboVec Vector Index
   ========================================================================= */

export class TurboVecIndex {
  /**
   * @param {Object} config
   * @param {number} config.dim Dimension of vectors
   * @param {1 | 2 | 4 | 8} [config.bits=4] Quantization precision
   * @param {string} [config.name='default'] Index identifier
   */
  constructor({ dim = 384, bits = 4, name = 'default' } = {}) {
    this.name = name
    this.dim = dim
    this.bits = bits
    this.paddedDim = nextPowerOfTwo(dim)
    this.signs = generateSigns(this.paddedDim)
    this.entries = new Map() // id -> { id, qVec, text, metadata, timestamp }
  }

  /**
   * Add a single vector to the index
   */
  addVector(id, vector, { text = '', metadata = {} } = {}) {
    if (!id) throw new Error('Vector ID is required')
    if (!vector || vector.length !== this.dim) {
      throw new Error(`Vector dimension mismatch: expected ${this.dim}, received ${vector?.length || 0}`)
    }

    const qVec = turboQuantize(vector, { bits: this.bits, signs: this.signs })
    this.entries.set(String(id), {
      id: String(id),
      qVec,
      text,
      metadata,
      timestamp: Date.now(),
    })
    return this
  }

  /**
   * Add a batch of vectors
   */
  addBatch(items = []) {
    let count = 0
    for (const item of items) {
      if (item?.id && item?.vector) {
        this.addVector(item.id, item.vector, {
          text: item.text || '',
          metadata: item.metadata || {},
        })
        count++
      }
    }
    return count
  }

  /**
   * Delete vector by ID
   */
  delete(id) {
    return this.entries.delete(String(id))
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries.clear()
  }

  /**
   * Returns vector count
   */
  get size() {
    return this.entries.size
  }

  /**
   * Top-K Nearest Neighbor similarity search using Asymmetric Distance Computation
   */
  search(queryVector, { topK = 5, filter = null, minScore = -1 } = {}) {
    if (!queryVector || queryVector.length !== this.dim) {
      throw new Error(`Query vector dimension mismatch: expected ${this.dim}, got ${queryVector?.length}`)
    }

    const results = []
    for (const entry of this.entries.values()) {
      if (filter && typeof filter === 'function' && !filter(entry)) {
        continue
      }
      const score = turboCosineSimilarity(queryVector, entry.qVec, { signs: this.signs })
      if (score >= minScore) {
        results.push({
          id: entry.id,
          score,
          text: entry.text,
          metadata: entry.metadata,
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /**
   * Get memory usage statistics & compression metrics
   */
  getStats() {
    const count = this.entries.size
    const uncompressedBytesPerVec = this.dim * 4 // Float32
    const compressedBytesPerVec = Math.ceil(this.paddedDim * (this.bits / 8)) + 16 // Data + metadata
    const totalUncompressedBytes = count * uncompressedBytesPerVec
    const totalCompressedBytes = count * compressedBytesPerVec
    const compressionRatio = totalCompressedBytes > 0 
      ? Number((totalUncompressedBytes / totalCompressedBytes).toFixed(2)) 
      : (uncompressedBytesPerVec / compressedBytesPerVec)

    return {
      name: this.name,
      vectorCount: count,
      dimension: this.dim,
      paddedDimension: this.paddedDim,
      bitsPerDimension: this.bits,
      compressedBytesPerVector: compressedBytesPerVec,
      uncompressedBytesPerVector: uncompressedBytesPerVec,
      totalMemoryKB: Number((totalCompressedBytes / 1024).toFixed(2)),
      savedMemoryKB: Number(((totalUncompressedBytes - totalCompressedBytes) / 1024).toFixed(2)),
      compressionRatio: `${compressionRatio}x`,
    }
  }

  /**
   * Export index to serializable JSON format
   */
  toJSON() {
    const serializedEntries = []
    for (const [id, entry] of this.entries.entries()) {
      serializedEntries.push({
        id,
        text: entry.text,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
        qVec: {
          data: Array.from(entry.qVec.data),
          bits: entry.qVec.bits,
          origDim: entry.qVec.origDim,
          paddedDim: entry.qVec.paddedDim,
          min: entry.qVec.min,
          scale: entry.qVec.scale,
          norm: entry.qVec.norm,
        },
      })
    }

    return {
      version: '1.0',
      type: 'turbovec_index',
      name: this.name,
      dim: this.dim,
      bits: this.bits,
      entries: serializedEntries,
    }
  }

  /**
   * Restore index from JSON object
   */
  static fromJSON(json) {
    if (!json || json.type !== 'turbovec_index') {
      throw new Error('Invalid TurboVec index JSON structure')
    }
    const index = new TurboVecIndex({
      name: json.name,
      dim: json.dim,
      bits: json.bits,
    })

    for (const item of json.entries || []) {
      const qVec = {
        data: new Uint8Array(item.qVec.data),
        bits: item.qVec.bits,
        origDim: item.qVec.origDim,
        paddedDim: item.qVec.paddedDim,
        min: item.qVec.min,
        scale: item.qVec.scale,
        norm: item.qVec.norm,
      }
      index.entries.set(String(item.id), {
        id: String(item.id),
        qVec,
        text: item.text || '',
        metadata: item.metadata || {},
        timestamp: item.timestamp || Date.now(),
      })
    }
    return index
  }
}
