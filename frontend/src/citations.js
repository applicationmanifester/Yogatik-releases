/**
 * Hybrid-RAG inline citations — the glue between retrieval and the answer.
 *
 * Three pure concerns, deliberately side-effect free (tests pin them without a
 * db, a model, or React):
 *
 *  1. `fuse` — Reciprocal Rank Fusion (k=60) of two ranked candidate lists
 *     (BM25 + a semantic/vector engine). Rank-based, so it is robust to
 *     score-scale differences between engines and needs no tuning beyond k.
 *     Fusion is ADDITIVE: if only one engine produced results the fused output
 *     is simply that list — a single-engine day never corrupts anything.
 *  2. `withCitationIds` — numbers the fused chunks with stable citation ids
 *     `[1]..[n]`, which is exactly what doc_search hands the model so it can
 *     cite by number naturally.
 *  3. `extractCitations` / `buildSourcesStrip` — reads a FINISHED answer text
 *     back out of the same conventions (`[1]`, `[2,3]`, `[citation:1]`) and
 *     pairs each cited number with its row to build the UI's sources strip.
 *
 * Nothing here mutates message text: the strip is derived at render time from
 * the already-stored tool result, so the persisted message stays byte-identical.
 */

/** Standard RRF damping constant (Cormack et al. 2009;also semantic.js). */
export const RRF_K = 60

/** Answer ids must be plausible citation numbers, not array indices by accident. */
const MAX_CITATION_ID = 999

/**
 * The one appended instruction line shown to the model alongside doc_search
 * results (documents.js appends it; single source of truth so tests can pin it).
 */
export const CITE_INSTRUCTION = 'When using these results, cite the bracketed number, e.g. [1].'

const identityId = new WeakMap()
let identitySeq = 0

/**
 * Identity for deduping a row across the two candidate lists. Engines usually
 * hand back the same chunk objects (or cheap clones of them), so content keys
 * win first; objects with no usable content fall back to true identity.
 */
function keyOf(row) {
  if (row === null || typeof row !== 'object') return `v:${String(row)}`
  if (row.key != null) return `k:${String(row.key)}`
  if (row.id != null) return `k:${String(row.id)}`
  if (typeof row.text === 'string' && row.text) return `t:${row.text}`
  if (typeof row.passage === 'string' && row.passage) return `p:${row.passage}`
  let id = identityId.get(row)
  if (id === undefined) identityId.set(row, (id = ++identitySeq))
  return `o:${id}`
}

/**
 * Reciprocal Rank Fusion of two ranked candidate lists.
 *
 * score = Σ over the lists the row appears in of 1 / (k + rank + 1), with
 * 0-based `rank` — the same counting semantic.js' reranker uses, so the two
 * fusion sites agree.
 *
 * Tie handling is deterministic: equal RRF scores order by the rank each row
 * was BEST seen at (evidence quality, not luck), then by first encounter.
 *
 * @param {Array<(object|*)>} aRows first engine's rows, best first (e.g. BM25)
 * @param {Array<(object|*)>} bRows second engine's rows, best first (e.g. semantic)
 * @param {{ k?: number }} [opts] damping constant; defaults to 60
 * @returns {Array<object>} fused rows, best first. Object rows are copied
 *   (`{ ...row, rrfScore }`) with the row's own engine fields preserved; a
 *   single-engine list passes through in its own order (fusion is additive).
 */
export function fuse(aRows, bRows, { k = RRF_K } = {}) {
  const kk = Number.isFinite(k) && k > 0 ? k : RRF_K
  const a = Array.isArray(aRows) ? aRows.filter(r => r != null) : []
  const b = Array.isArray(bRows) ? bRows.filter(r => r != null) : []

  const entries = new Map()
  const addList = (rows, side) => rows.forEach((row, rank) => {
    const key = keyOf(row)
    let e = entries.get(key)
    if (!e) {
      e = { row, rrf: 0, aRank: Infinity, bRank: Infinity, order: entries.size }
      entries.set(key, e)
    }
    e.rrf += 1 / (kk + rank + 1)
    if (side === 0) e.aRank = Math.min(e.aRank, rank)
    else e.bRank = Math.min(e.bRank, rank)
  })
  addList(a, 0)
  addList(b, 1)

  return [...entries.values()]
    .sort((x, y) =>
      y.rrf - x.rrf ||
      Math.min(x.aRank, x.bRank) - Math.min(y.aRank, y.bRank) ||
      x.order - y.order)
    .map(e => (e.row !== null && typeof e.row === 'object'
      ? { ...e.row, rrfScore: e.rrf }
      : { value: e.row, rrfScore: e.rrf }))
}

/**
 * Assign stable citation ids `[1]..[n]` down a ranked row list (best first).
 * Overwrites any stale `n` so the output numbering is always 1..n.
 */
export function withCitationIds(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, i) => ({ ...(row || {}), n: i + 1 }))
}

/* ==========================================================================
   Answer-side parsing. Two sweeps run before matching so prose that happens to
   contain a bracket does not get mistaken for a citation: fenced/inline code,
   and markdown link syntax (a `[3](url)` link's LABEL is a citation; its
   definition line `[3]: https://…` is not).
   ========================================================================== */

const CODE_SWEEP = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g

// Footnote/definition lines: `…\n[1]: https://…` or `[citation:1]: somewhere`.
const LINKDEF_SWEEP = /^\s*\[(?:\d+(?:\s*,\s*\d+)*|citation:\s*[\d,\s]+)\]\s*:\s*\S.*$/gim

// Bracketed-number markdown links keep their number, drop the target:
// `[1](report.pdf)` cites 1; `[leave policy](url)` does not match (non-numeric).
const NUM_LINK_SWEEP = /\[(\d+(?:\s*,\s*\d+)*)\]\([^()\n]*\)/g
const CITE_LINK_SWEEP = /\[citation:\s*(\d+(?:\s*,\s*\d+)*)\]\([^()\n]*\)/g

// The two accepted citation forms (each call builds a fresh regex object so
// the stateful `g` lastIndex can never leak between calls). Anything bracketed
// that is not purely comma-separated digits (or the `citation:` prefix) is
// prose, not a citation.

/**
 * Extract cited citation ids from a finished answer text.
 * Accepts `[1]`, `[2,3]`, `[2, 3]`, `[citation:1]`, `[citation: 2, 3]`.
 * @returns {number[]} unique ids, ascending (strip order reads best sorted)
 */
export function extractCitations(text) {
  const norm = String(text ?? '')
    .replace(CODE_SWEEP, ' ')
    .replace(LINKDEF_SWEEP, ' ')
    .replace(CITE_LINK_SWEEP, '[$1]')
    .replace(NUM_LINK_SWEEP, '[$1]')

  const re = /\[citation:\s*(\d+(?:[\s,]+\d+)*)\]|\[(\d+(?:\s*,\s*\d+)*)\](?!\s*:)/g
  const found = []
  let m
  while ((m = re.exec(norm))) {
    const raw = m[1] !== undefined ? m[1] : m[2]
    for (const tok of raw.split(',')) {
      const n = Number(tok.trim())
      if (Number.isInteger(n) && n >= 1 && n <= MAX_CITATION_ID && !found.includes(n)) found.push(n)
    }
  }
  return found.sort((x, y) => x - y)
}

/** Collapse a retrieved chunk to a one-ish line preview for chip/details text. */
function previewOf(text, cap = 160) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= cap) return flat
  return `${flat.slice(0, cap - 1)}…`
}

/**
 * Build the sources-strip data for a finished answer.
 *
 * Pairs each cited `[n]` with its retrieved row (doc_search's numbered
 * passages; legacy rows stored before numbering fall back to their list
 * position). Rows the answer never cited are excluded — the strip shows what
 * the answer RESTED ON, not everything retrieval surfaced.
 *
 * @param {string} answerText the finished answer (never the raw db text)
 * @param {Array<{n?: number, document?: string, passage?: string, chunk?: number,
 *                of?: number, score?: number}>} passages numbered tool rows
 * @returns {{ count: number, items: Array<{n: number, docName: string,
 *   chunk?: number, of?: number, preview: string, score?: number}>} | null}
 *   null when there are no citations or no matching rows (the caller hides)
 */
export function buildSourcesStrip(answerText, passages) {
  const rows = Array.isArray(passages) ? passages.filter(p => p && typeof p === 'object') : []
  if (!rows.length) return null

  const cited = extractCitations(answerText)
  if (!cited.length) return null

  // Tool rows are numbered at the source; alphabet rows without `n` (older
  // messages persisted before numbering existed) fall back to position.
  const byN = new Map(rows.map((p, i) => [p.n ?? i + 1, p]))

  const items = []
  for (const n of cited) {
    const row = byN.get(n)
    if (!row) continue // the model cited a number this turn never returned
    const score = Number(row.score)
    items.push({
      n,
      docName: String(row.document ?? row.docName ?? row.source ?? 'Document'),
      chunk: row.chunk,
      of: row.of,
      preview: previewOf(row.passage ?? row.text ?? row.excerpt ?? ''),
      score: Number.isFinite(score) ? Math.round(score * 100) / 100 : undefined,
    })
  }
  if (!items.length) return null
  return { count: items.length, items }
}
