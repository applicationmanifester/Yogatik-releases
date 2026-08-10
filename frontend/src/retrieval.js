/**
 * Browser-native retrieval — BM25 over locally chunked documents.
 *
 * Deliberately not vector embeddings: a transformer embedder costs a ~25 MB
 * model download and seconds of WASM warm-up, and on the small corpora this app
 * handles (a handful of user-uploaded files) BM25 matches or beats it for
 * keyword-style questions while running in microseconds with zero download.
 */

import { db } from './db'

const STOP = new Set(('a an the and or but if then else of to in on at by for with about as is are was were be been ' +
  'being it its this that these those i you he she they we me my your our their from not no so such can will just').split(' '))

const K1 = 1.5
const B = 0.75

/**
 * Conservative suffix stripping so a query for "meal reimbursement" matches
 * text that says "meals are reimbursed". Full Porter stemming is overkill here;
 * these five rules recover most of the recall for a fraction of the code.
 */
function stem(t) {
  if (t.length <= 4) return t
  let w = t
    .replace(/ies$/, 'y')
    .replace(/(ements?|ments?)$/, '')
    .replace(/(ations?|ions?)$/, '')
    .replace(/(edly|ingly)$/, '')

  // "ss" is part of the word (express, address), not a plural marker
  if (!/ss$/.test(w)) w = w.replace(/(ing|ed|es|s)$/, '')

  // Undo the doubled consonant English adds before -ing/-ed: shipping → ship
  if (/([bdfglmnprt])\1$/.test(w) && w.length > 3) w = w.slice(0, -1)

  // Drop a silent trailing -e so "expense" and "expenses" land on one stem
  if (w.length > 4 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1)

  return w.length >= 3 ? w : t
}

export function tokenize(text) {
  return String(text).toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(stem)
    .filter(Boolean)
}

/**
 * Split text into overlapping chunks on paragraph/sentence boundaries so a
 * retrieved chunk reads as coherent prose rather than a mid-sentence fragment.
 */
export function chunkText(text, { size = 1200, overlap = 200 } = {}) {
  const clean = String(text).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (clean.length <= size) return clean ? [clean] : []

  const paras = clean.split(/\n{2,}/)
  const chunks = []
  let buf = ''

  const flush = () => {
    if (!buf.trim()) return
    chunks.push(buf.trim())
    if (overlap <= 0) { buf = ''; return }
    // Carry over trailing context, but snap to a word boundary — slicing blind
    // leaves chunks starting mid-word ("ays and costs...").
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

/** Build an inverted index over chunks: { chunks, df, len, avgLen, n } */
export function buildIndex(chunks) {
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

  return {
    tf, df, len,
    n: chunks.length,
    avgLen: len.reduce((a, b) => a + b, 0) / (chunks.length || 1),
  }
}

/** BM25 ranking. Returns [{ i, score }] sorted desc. */
export function search(index, query, topK = 5) {
  const terms = tokenize(query)
  if (!terms.length || !index.n) return []

  const scores = new Float64Array(index.n)
  for (const term of terms) {
    const df = index.df.get(term)
    if (!df) continue
    // +1 keeps idf positive even for terms present in every chunk
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5))
    for (let i = 0; i < index.n; i++) {
      const f = index.tf[i].get(term)
      if (!f) continue
      const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * index.len[i] / index.avgLen))
      scores[i] += idf * norm
    }
  }

  return Array.from(scores, (score, i) => ({ i, score }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Search 100% locally across all stored IndexedDB documents and chat history.
 * Runs entirely on-device without network requests or external search APIs.
 */
export async function searchLocalVault(query, topK = 5) {
  try {
    const docs = await db.documents.toArray().catch(() => [])
    const convs = await db.conversations.toArray().catch(() => [])

    const corpus = []

    docs.forEach(doc => {
      if (doc.text) {
        const chunks = chunkText(doc.text, { size: 1000, overlap: 150 })
        chunks.forEach((chunk, i) => {
          corpus.push({ source: `File: ${doc.name || 'Document'}`, text: chunk, chunkIndex: i })
        })
      }
    })

    convs.forEach(c => {
      if (c.messages?.length) {
        c.messages.forEach(m => {
          if (m.content && typeof m.content === 'string' && m.content.length > 30) {
            corpus.push({ source: `Chat: ${c.title || 'Untitled'}`, text: m.content })
          }
        })
      }
    })

    if (!corpus.length) return { results: [], note: 'No local documents or chat history stored in IndexedDB.' }

    const index = buildIndex(corpus.map(item => item.text))
    const hits = search(index, query, topK)

    const matches = hits.map(hit => ({
      source: corpus[hit.i].source,
      score: Math.round(hit.score * 100) / 100,
      excerpt: corpus[hit.i].text,
    }))

    return {
      success: true,
      query,
      total_corpus_chunks: corpus.length,
      results_count: matches.length,
      matches,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
