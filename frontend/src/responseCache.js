/**
 * responseCache.js — Semantic response caching for repeated queries.
 * Uses local embeddings to detect similar queries and return cached responses.
 */

import { getSetting, setSetting } from './db'

const CACHE_KEY = 'response_cache'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const MAX_CACHE_SIZE = 100
const SIMILARITY_THRESHOLD = 0.85

let cache = null

/** Initialize cache from persistent storage */
async function initCache() {
  if (cache) return cache
  try {
    const saved = await getSetting(CACHE_KEY)
    if (saved && saved.entries && Date.now() - saved.timestamp < CACHE_TTL) {
      cache = new Map(Object.entries(saved.entries))
    } else {
      cache = new Map()
    }
  } catch {
    cache = new Map()
  }
  return cache
}

/** Simple hash for query deduplication */
function hashQuery(query) {
  let hash = 0
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/** Very simple embedding - word frequency vector (for demo; replace with real embeddings) */
function simpleEmbed(text) {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const freq = {}
  for (const w of words) freq[w] = (freq[w] || 0) + 1
  return freq
}

/** Cosine similarity between two frequency vectors */
function cosineSimilarity(vec1, vec2) {
  const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)])
  let dot = 0, norm1 = 0, norm2 = 0
  for (const k of keys) {
    const v1 = vec1[k] || 0
    const v2 = vec2[k] || 0
    dot += v1 * v2
    norm1 += v1 * v1
    norm2 += v2 * v2
  }
  if (norm1 === 0 || norm2 === 0) return 0
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

/** Get cached response if similar query exists */
export async function getCachedResponse(query, provider, model) {
  const cacheMap = await initCache()
  const key = `${provider}:${model}:${hashQuery(query)}`
  
  // Exact match first
  if (cacheMap.has(key)) {
    const entry = cacheMap.get(key)
    if (Date.now() - entry.ts < CACHE_TTL) {
      return { ...entry.response, cached: true, similarity: 1.0, cacheKey: key }
    } else {
      cacheMap.delete(key)
    }
  }
  
  // Semantic similarity search
  const queryEmbedding = simpleEmbed(query)
  let bestMatch = null
  let bestScore = 0
  
  for (const [k, entry] of cacheMap.entries()) {
    if (Date.now() - entry.ts >= CACHE_TTL) {
      cacheMap.delete(k)
      continue
    }
    // Check same provider/model
    if (!k.startsWith(`${provider}:${model}:`)) continue
    
    const score = cosineSimilarity(queryEmbedding, entry.queryEmbedding)
    if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
      bestScore = score
      bestMatch = entry
    }
  }
  
  if (bestMatch) {
    return { ...bestMatch.response, cached: true, similarity: bestScore }
  }
  
  return null
}

/** Cache a response */
export async function cacheResponse(query, provider, model, response) {
  const cacheMap = await initCache()
  const key = `${provider}:${model}:${hashQuery(query)}`
  
  cacheMap.set(key, {
    query,
    queryEmbedding: simpleEmbed(query),
    response,
    ts: Date.now(),
  })
  
  // LRU eviction
  if (cacheMap.size > MAX_CACHE_SIZE) {
    const entries = [...cacheMap.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
      cacheMap.delete(entries[i][0])
    }
  }
  
  // Persist
  await setSetting(CACHE_KEY, {
    entries: Object.fromEntries(cacheMap),
    timestamp: Date.now(),
  })
}

/** Clear cache */
export async function clearCache() {
  cache = new Map()
  await setSetting(CACHE_KEY, { entries: {}, timestamp: Date.now() })
}

/** Get cache stats */
export async function getCacheStats() {
  const cacheMap = await initCache()
  let valid = 0
  for (const [, entry] of cacheMap.entries()) {
    if (Date.now() - entry.ts < CACHE_TTL) valid++
  }
  return { size: cacheMap.size, valid, maxSize: MAX_CACHE_SIZE }
}