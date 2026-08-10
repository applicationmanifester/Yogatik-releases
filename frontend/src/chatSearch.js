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
import { buildIndex, search, tokenize } from './retrieval'

let cache = null            // { index, rows, at }
const TTL = 60_000

export function invalidateChatIndex() { cache = null }

async function getIndex() {
  if (cache && Date.now() - cache.at < TTL) return cache

  const [messages, conversations] = await Promise.all([
    db.messages.toArray(),
    db.conversations.toArray(),
  ])
  const titles = new Map(conversations.map(c => [c.id, c.title]))

  const rows = []
  for (const m of messages) {
    // Multimodal turns hold parts, not a string; only their text is searchable.
    const text = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content) ? m.content.map(p => p.text || '').join(' ') : ''
    if (text.trim().length < 2) continue
    rows.push({
      id: m.id,
      conversationId: m.conversationId,
      title: titles.get(m.conversationId) || 'Chat',
      role: m.role,
      createdAt: m.createdAt,
      text,
    })
  }

  cache = { index: buildIndex(rows.map(r => r.text)), rows, at: Date.now() }
  return cache
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

// Any write to messages or conversations makes the cached index stale.
if (typeof Dexie !== 'undefined') {
  for (const table of ['messages', 'conversations']) {
    db[table]?.hook('creating', invalidateChatIndex)
    db[table]?.hook('deleting', invalidateChatIndex)
    db[table]?.hook('updating', invalidateChatIndex)
  }
}
