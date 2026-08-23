/**
 * Optional on-device semantic re-ranking, layered over BM25 (retrieval.js).
 * BM25 stays the default — fast, zero-download, great on keyword-y corpora.
 * When the user turns on semanticSearch, this re-orders BM25's top candidates
 * by MEANING, catching paraphrases keyword search misses ("car" vs "vehicle").
 *
 * Includes Int8 vector quantization to reduce embedding memory consumption
 * by 75% on large corpora and caches.
 */
import { webgpuDevice } from './gpu'

const CDN = 'https://esm.run/@huggingface/transformers@3.7.6'
export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2' // 384-dim, ~23MB q8
export const EMBED_SIZE_MB = 23

let lib = null
let extractor = null
let loading = null
let consented = false

/** App mirrors the `semanticSearch` feature toggle in here (like localVLM). */
export function setSemanticConsent(v) { consented = !!v }

/** True once the weights are in the Transformers.js cache — then it is free. */
export async function isSemanticCached() {
  if (typeof caches === 'undefined') return false
  try {
    for (const name of await caches.keys()) {
      if (!/transformers/i.test(name)) continue
      const cache = await caches.open(name)
      if ((await cache.keys()).some(r => r.url.includes('all-MiniLM'))) return true
    }
  } catch { /* opaque storage: assume not cached */ }
  return false
}

async function getExtractor() {
  if (extractor) return extractor
  if (loading) return loading
  // Downloading 23MB is a decision. Refuse unless the user opted in, or the
  // weights are already cached (then it is free and offline).
  if (!consented && !(await isSemanticCached())) {
    throw new Error('Semantic search is off — enable it in Personalise to download the model.')
  }
  loading = (async () => {
    if (!lib) lib = await import(/* @vite-ignore */ CDN)
    const device = (await webgpuDevice()) === 'webgpu' ? 'webgpu' : 'wasm'
    extractor = await lib.pipeline('feature-extraction', EMBED_MODEL, {
      device, dtype: device === 'webgpu' ? 'fp32' : 'q8',
    })
    return extractor
  })()
  try { return await loading } finally { loading = null }
}

/* =========================================================================
   Int8 Vector Quantization & Acceleration
   Reduces 384-dim Float32 (1536 bytes) to Int8 (384 bytes + 8 bytes meta = 392 bytes)
   ========================================================================= */

/**
 * Quantizes a float vector into an Int8Array with dynamic min/max scaling.
 * @param {number[] | Float32Array} vec 
 * @returns {{ data: Int8Array, min: number, scale: number, norm: number }}
 */
export function quantizeVector(vec) {
  if (!vec || !vec.length) {
    return { data: new Int8Array(0), min: 0, scale: 1, norm: 0 }
  }
  const len = vec.length
  let min = Infinity
  let max = -Infinity
  let normSq = 0

  for (let i = 0; i < len; i++) {
    const val = vec[i]
    if (val < min) min = val
    if (val > max) max = val
    normSq += val * val
  }

  const range = max - min
  // Scale maps [min, max] to [-128, 127]
  const scale = range === 0 ? 1 : range / 255
  const data = new Int8Array(len)

  for (let i = 0; i < len; i++) {
    const normVal = (vec[i] - min) / scale - 128
    data[i] = Math.max(-128, Math.min(127, Math.round(normVal)))
  }

  return { data, min, scale, norm: Math.sqrt(normSq) }
}

/**
 * Reconstructs a float vector from quantized representation.
 * @param {{ data: Int8Array, min: number, scale: number }} qVec 
 * @returns {Float32Array}
 */
export function dequantizeVector(qVec) {
  if (!qVec?.data?.length) return new Float32Array(0)
  const { data, min, scale } = qVec
  const len = data.length
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = (data[i] + 128) * scale + min
  }
  return out
}

/**
 * Computes cosine similarity directly between two quantized vectors with scale correction.
 */
export function quantizedCosineSimilarity(qA, qB) {
  if (!qA?.data?.length || !qB?.data?.length || qA.data.length !== qB.data.length) return 0
  const a = qA.data
  const b = qB.data
  const len = a.length

  let intDot = 0
  let sumA = 0
  let sumB = 0

  for (let i = 0; i < len; i++) {
    const vA = a[i] + 128
    const vB = b[i] + 128
    intDot += vA * vB
    sumA += vA
    sumB += vB
  }

  const { min: minA, scale: scaleA, norm: normA } = qA
  const { min: minB, scale: scaleB, norm: normB } = qB

  if (!normA || !normB) return 0

  // (scaleA * vA + minA) . (scaleB * vB + minB)
  const dotProduct = (scaleA * scaleB * intDot) + (scaleA * minB * sumA) + (scaleB * minA * sumB) + (len * minA * minB)
  return dotProduct / (normA * normB)
}

/** Embed texts → array of L2-normalized vectors ([n][dim]). */
export async function embed(texts) {
  const ex = await getExtractor()
  const out = await ex(texts, { pooling: 'mean', normalize: true })
  return out.tolist()
}

// Inputs are already normalized, so a dot product IS cosine similarity.
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/**
 * Re-rank BM25 candidates by semantic similarity, blended with their BM25 score
 * so a strong keyword hit is never discarded. `items` = [{ text, score, … }].
 * Uses Int8 quantization for fast vector comparison when candidate sets grow.
 */
export async function semanticRerank(query, items, topK = 5, { k = 60 } = {}) {
  if (!items?.length || !query) return (items || []).slice(0, topK)
  try {
    const vecs = await embed([query, ...items.map(it => (it.text || '').slice(0, 2000))])
    const qQuant = quantizeVector(vecs[0])
    const sims = items.map((_, i) => {
      const itemQuant = quantizeVector(vecs[i + 1])
      return quantizedCosineSimilarity(qQuant, itemQuant)
    })
    return rrfFuse(items, sims, topK, k)
  } catch {
    return items.slice(0, topK)
  }
}

/**
 * Reciprocal Rank Fusion of the BM25 order (items are pre-sorted by BM25) and the
 * semantic order. Rank-based, so it's robust to score-scale differences between
 * the two systems and needs no tuning beyond k. score = Σ 1/(k + rank).
 */
export function rrfFuse(items, sims, topK = 5, k = 60) {
  const semOrder = items.map((_, i) => i).sort((a, b) => sims[b] - sims[a])
  const semRank = new Map(semOrder.map((idx, rank) => [idx, rank]))
  return items
    .map((it, i) => {
      const bmRank = i                       // input is already BM25-sorted
      const sRank = semRank.get(i)
      const score = 1 / (k + bmRank + 1) + 1 / (k + sRank + 1)
      return { ...it, semanticScore: sims[i], score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// TurboQuant / TurboVec high-performance quantizers
export {
  turboQuantize,
  turboDequantize,
  turboCosineSimilarity,
  TurboVecIndex,
} from './turbovec'

