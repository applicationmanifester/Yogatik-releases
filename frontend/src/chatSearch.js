/**
 * Full-text search over every stored message.
 *
 * The command palette only ever matched conversation titles, so the actual
 * content of months of chat was unreachable. This reuses the BM25 index already
 * written for documents — no embeddings, no new dependency, works offline, and
 * ranks by relevance rather than by "contains the substring".
 *
 * The index is built once per query burst and invalidated on write, because
 * rebuilding for every keystroke of a 5000-message history is wasteful and
 * caching it forever would go stale the moment a reply lands.
 */

import Dexie from 'dexie'
import { db } from './db'
import { buildIndexAsync, appendToIndex, search, tokenize } from './retrieval'

let cache = null            // { index, rows, at, maxId }
let building = null         // in-flight build, so a burst shares one pass
const TTL = 60_000

/**
 * Drop the index entirely. Reserved for structural changes (a deleted
 * conversation, a retitle) — a NEW MESSAGE does not need this, and treating it
 * as though it did was the whole problem: every reply threw away the index, so
 * the next search rebuilt the entire history. Measured 1089ms of synchronous
 * main-thread work at 20,000 messages.
 */
export function invalidateChatIndex() { cache = null; building = null }

/** Extract the searchable text of a stored message. */
function textOf(m) {
  // Multimodal turns hold parts, not a string; only their text is searchable.
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) return m.content.map(p => p.text || '').join(' ')
  return ''
}

function rowFor(m, titles) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    title: titles.get(m.conversationId) || 'Chat',
    role: m.role,
    createdAt: m.createdAt,
    text: textOf(m),
  }
}

/**
 * Fold in only the messages written since the index was built.
 *
 * `++id` is monotonic, so everything newer than the high-water mark is exactly
 * the set we have not seen. Appending is O(the new message); rebuilding was
 * O(every message ever stored).
 */
async function catchUp(current) {
  const fresh = await db.messages.where('id').above(current.maxId).toArray()
  if (!fresh.length) return current
  const convs = await db.conversations.toArray()
  const titles = new Map(convs.map(c => [c.id, c.title]))
  for (const m of fresh) {
    if (m.id > current.maxId) current.maxId = m.id
    const row = rowFor(m, titles)
    if (row.text.trim().length < 2) continue
    current.rows.push(row)
    appendToIndex(current.index, row.text)
  }
  current.at = Date.now()
  return current
}

async function getIndex() {
  if (cache) {
    // The TTL now only guards against edits made outside the hooks; new
    // messages are caught up incrementally rather than triggering a rebuild.
    if (Date.now() - cache.at < TTL) return catchUp(cache)
    invalidateChatIndex()
  }
  if (building) return building

  building = (async () => {
    const [messages, conversations] = await Promise.all([
      db.messages.toArray(),
      db.conversations.toArray(),
    ])
    const titles = new Map(conversations.map(c => [c.id, c.title]))

    const rows = []
    let maxId = 0
    for (const m of messages) {
      if (typeof m.id === 'number' && m.id > maxId) maxId = m.id
      const row = rowFor(m, titles)
      if (row.text.trim().length < 2) continue
      rows.push(row)
    }

    // Chunked so the UI keeps painting. The total work is the same; what
    // changes is that pressing Ctrl+K no longer freezes the app for a second
    // before the first result appears.
    const index = await buildIndexAsync(rows.map(r => r.text))
    cache = { index, rows, at: Date.now(), maxId }
    return cache
  })()

  try { return await building } finally { building = null }
}

/** A short excerpt centred on the first matching term. */
export function excerpt(text, query, radius = 90) {
  const terms = tokenize(query)
  const lower = text.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return text.slice(0, radius * 2).trim()
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * @returns {Promise<Array<{conversationId:number, title:string, role:string,
 *   createdAt:number, snippet:string, score:number}>>}
 */
export async function searchChats(query, topK = 20) {
  if (!query || query.trim().length < 2) return []
  const { index, rows } = await getIndex()

  const hits = search(index, query, topK * 3)
  const out = []
  const seen = new Set()
  for (const { i, score } of hits) {
    const row = rows[i]
    if (!row) continue
    // One hit per conversation: ten matches from the same chat is not a result
    // list, it is noise.
    if (seen.has(row.conversationId)) continue
    seen.add(row.conversationId)
    out.push({
      conversationId: row.conversationId,
      title: row.title,
      role: row.role,
      createdAt: row.createdAt,
      snippet: excerpt(row.text, query),
      score,
    })
    if (out.length >= topK) break
  }
  return out
}

// A DELETE or an UPDATE changes rows the index already holds, so it has to go.
// A CREATE does not: catchUp() folds new messages in incrementally, and
// throwing the index away on every reply is what made searching an active
// conversation rebuild the entire history each time.
if (typeof Dexie !== 'undefined') {
  for (const table of ['messages', 'conversations']) {
    db[table]?.hook('deleting', invalidateChatIndex)
    db[table]?.hook('updating', invalidateChatIndex)
  }
  // A new conversation changes the titles the rows carry.
  db.conversations?.hook('creating', invalidateChatIndex)
}
