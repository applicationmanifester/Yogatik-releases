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
