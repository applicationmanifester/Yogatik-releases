/**
 * Generic compute worker — keeps CPU-heavy, self-contained tasks off the main
 * thread so the React UI never janks. Tasks are pure functions keyed by name;
 * the client (computeWorker.js) posts {id, task, payload} and gets back
 * {id, ok, result} or {id, ok:false, error}. Add heavy work here (large-text
 * digest/tokenise; OCR/encode can follow the same protocol with their own
 * worker) rather than running it inline in a tool.
 */

const TASKS = {
  // SHA-256 hex of a (possibly large) string — the kind of work that visibly
  // blocks the thread once inputs get big.
  async sha256(text) {
    const bytes = new TextEncoder().encode(String(text ?? ''))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  },
  // Word-frequency map over large text (illustrative CPU task).
  wordFrequency(text) {
    const freq = Object.create(null)
    for (const w of String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
      freq[w] = (freq[w] || 0) + 1
    }
    return freq
  },
  // Fast approximate token count over large documents (~4 chars/token heuristic with whitespace weighting)
  approxTokenCount(text) {
    const str = String(text ?? '')
    if (!str.length) return 0
    const words = str.trim().split(/\s+/).length
    const chars = str.length
    return Math.ceil((chars / 4 + words) / 2)
  },
  // Fast off-thread JSON formatter for large data blobs
  formatJson({ data, indent = 2 }) {
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { return data }
    }
    return JSON.stringify(data, null, indent)
  },
  // Summary numeric statistics over large arrays
  computeStats(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return { count: 0, mean: 0, stdDev: 0, min: 0, max: 0, median: 0 }
    }
    const clean = numbers.map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    const n = clean.length
    if (n === 0) return { count: 0, mean: 0, stdDev: 0, min: 0, max: 0, median: 0 }
    const sum = clean.reduce((acc, v) => acc + v, 0)
    const mean = sum / n
    const variance = clean.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n
    const median = n % 2 === 0 ? (clean[n / 2 - 1] + clean[n / 2]) / 2 : clean[Math.floor(n / 2)]
    return {
      count: n,
      mean: Math.round(mean * 10000) / 10000,
      stdDev: Math.round(Math.sqrt(variance) * 10000) / 10000,
      min: clean[0],
      max: clean[n - 1],
      median: Math.round(median * 10000) / 10000,
    }
  },
}

self.onmessage = async (e) => {
  const { id, task, payload } = e.data || {}
  const fn = TASKS[task]
  if (!fn) { self.postMessage({ id, ok: false, error: `Unknown task: ${task}` }); return }
  try {
    self.postMessage({ id, ok: true, result: await fn(payload) })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) })
  }
}

// Exported so the client can run the exact same task inline as a fallback when
// Web Workers are unavailable (older webviews, tests, SSR).
export { TASKS }
