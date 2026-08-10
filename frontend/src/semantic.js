/**
 * Optional on-device semantic re-ranking, layered over BM25 (retrieval.js).
 * BM25 stays the default — fast, zero-download, great on keyword-y corpora.
 * When the user turns on semanticSearch, this re-orders BM25's top candidates
 * by MEANING, catching paraphrases keyword search misses ("car" vs "vehicle").
 *
 * Consent-gated: the embedding model (~23MB q8) downloads only after opt-in,
 * loaded from esm.run so the ONNX runtime never touches the default bundle.
 * No vectors are persisted — the query and a small shortlist are embedded on
 * demand, so there is no index to build, migrate, or keep in sync.
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
 * Falls back to the input order on ANY failure (model off, load error, no GPU),
 * so callers can invoke it unconditionally and BM25 remains the safety net.
 */
export async function semanticRerank(query, items, topK = 5, { k = 60 } = {}) {
  if (!items?.length || !query) return (items || []).slice(0, topK)
  try {
    const vecs = await embed([query, ...items.map(it => (it.text || '').slice(0, 2000))])
    const q = vecs[0]
    const sims = items.map((_, i) => dot(q, vecs[i + 1]))
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
