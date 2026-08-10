/**
 * Web Worker for background document chunking, BM25 indexing, and searching.
 * Keeps heavy NLP tokenization off the main React UI thread.
 */

const STOP = new Set(('a an the and or but if then else of to in on at by for with about as is are was were be been ' +
  'being it its this that these those i you he she they we me my your our their from not no so such can will just').split(' '))

const K1 = 1.5
const B = 0.75

function stem(t) {
  if (t.length <= 4) return t
  let w = t
    .replace(/ies$/, 'y')
    .replace(/(ements?|ments?)$/, '')
    .replace(/(ations?|ions?)$/, '')
    .replace(/(edly|ingly)$/, '')
  if (!/ss$/.test(w)) w = w.replace(/(ing|ed|es|s)$/, '')
  if (/([bdfglmnprt])\1$/.test(w) && w.length > 3) w = w.slice(0, -1)
  if (w.length > 4 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1)
  return w.length >= 3 ? w : t
}

function tokenize(text) {
  return String(text).toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(stem)
    .filter(Boolean)
}

function chunkText(text, { size = 1200, overlap = 200 } = {}) {
  const clean = String(text).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (clean.length <= size) return clean ? [clean] : []
  const paras = clean.split(/\n{2,}/)
  const chunks = []
  let buf = ''

  const flush = () => {
    if (!buf.trim()) return
    chunks.push(buf.trim())
    if (overlap <= 0) { buf = ''; return }
    let tail = buf.slice(-overlap)
    const cut = tail.search(/\s/)
    buf = cut >= 0 ? tail.slice(cut + 1) : ''
  }

  for (const para of paras) {
    if (para.length > size) {
      for (const sentence of para.match(/[^.!?]+[.!?]*\s*/g) || [para]) {
        if (buf.length + sentence.length > size) flush()
        buf += sentence
      }
    } else {
      if (buf.length + para.length > size) flush()
      buf += (buf ? '\n\n' : '') + para
    }
  }
  flush()
  return chunks.filter(c => c.length > 40)
}

function buildIndex(chunks) {
  const df = new Map()
  const tf = []
  const len = []
  chunks.forEach((chunk) => {
    const tokens = tokenize(chunk)
    const counts = new Map()
    tokens.forEach(t => counts.set(t, (counts.get(t) || 0) + 1))
    counts.forEach((_, term) => df.set(term, (df.get(term) || 0) + 1))
    tf.push(counts)
    len.push(tokens.length || 1)
  })
  const avgLen = len.reduce((a, b) => a + b, 0) / (chunks.length || 1)
  return { chunks, df, tf, len, avgLen, n: chunks.length }
}

function search(idx, query, topK = 5) {
  const qTokens = tokenize(query)
  if (!qTokens.length || !idx.n) return []
  const scores = new Array(idx.n).fill(0)
  qTokens.forEach((term) => {
    const docFreq = idx.df.get(term) || 0
    if (!docFreq) return
    const idf = Math.log((idx.n - docFreq + 0.5) / (docFreq + 0.5) + 1)
    for (let i = 0; i < idx.n; i++) {
      const f = idx.tf[i].get(term) || 0
      if (!f) continue
      const num = f * (K1 + 1)
      const den = f + K1 * (1 - B + B * (idx.len[i] / idx.avgLen))
      scores[i] += idf * (num / den)
    }
  })
  return scores
    .map((score, i) => ({ i, score }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

self.onmessage = function (e) {
  const { action, id, text, chunks, query, topK } = e.data
  if (action === 'chunkAndIndex') {
    const c = chunkText(text)
    const idx = buildIndex(c)
    self.postMessage({ id, action, chunks: c, indexData: { df: Array.from(idx.df.entries()), len: idx.len, avgLen: idx.avgLen, n: idx.n } })
  } else if (action === 'search') {
    const idxObj = {
      chunks,
      df: new Map(e.data.indexData.df),
      tf: chunks.map(c => {
        const counts = new Map()
        tokenize(c).forEach(t => counts.set(t, (counts.get(t) || 0) + 1))
        return counts
      }),
      len: e.data.indexData.len,
      avgLen: e.data.indexData.avgLen,
      n: e.data.indexData.n,
    }
    const hits = search(idxObj, query, topK)
    self.postMessage({ id, action, hits })
  }
}
