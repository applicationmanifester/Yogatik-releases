/**
 * Minimal long-term memory foundation: per-project save/recall over Dexie.
 *
 * The richer four-store framework lives in memory4.js (salience-ranked,
 * global). This module is the small project-scoped companion Sprint 4 called
 * for: a chat inside project X recalls what was saved inside project X, and
 * nothing else. Persistence reuses the existing `memories` table (db v5) so
 * no schema change is needed — project scoping rides on the `tag` field as
 * `project:<id>`, with `store` fixed to the caller's kind.
 *
 * Pure ranking (token overlap) is exported separately so tests never touch
 * IndexedDB.
 */

export const PROJECT_TAG = (projectId) => `project:${projectId ?? 'none'}`

function tokens(s) {
  return new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
}

/** Token-overlap relevance in [0,1] between a memory and a query. */
export function memoryRelevance(text, query) {
  const q = tokens(query)
  if (!q.size) return 0
  const t = tokens(text)
  let hit = 0
  for (const w of q) if (t.has(w)) hit++
  return hit / q.size
}

/** Rank memories best-first by relevance, then recency. Pure. */
export function rankMemories(items = [], query = '', limit = 8) {
  return [...items]
    .map((it) => ({ it, score: memoryRelevance(it?.text, query) }))
    .filter((s) => (query ? s.score > 0 : true))
    .sort((a, b) => b.score - a.score || (b.it?.at || 0) - (a.it?.at || 0))
    .slice(0, Math.max(0, limit))
    .map((s) => s.it)
}

async function _memoriesTable() {
  const { db } = await import('./db')
  return db.memories
}

/**
 * Save one memory line into a project scope.
 * @returns the stored record, or null when the text is empty.
 */
export async function saveMemory({ text, projectId = null, store = 'semantic', importance = 0.5 } = {}) {
  const clean = String(text || '').trim()
  if (!clean) return null
  const table = await _memoriesTable()
  const rec = {
    store,
    text: clean.slice(0, 2000),
    importance: Math.max(0, Math.min(1, Number(importance) || 0)),
    tag: PROJECT_TAG(projectId),
    projectId: projectId ?? null,
    refCount: 0,
    at: Date.now(),
  }
  rec.id = await table.add(rec)
  return rec
}

/**
 * Recall the best memories for a query within one project scope.
 * Recalls never leak across projects: only rows tagged for `projectId`
 * (plus untagged legacy rows when recalling the global scope) are read.
 */
export async function recallMemories(query = '', { projectId = null, limit = 8 } = {}) {
  const table = await _memoriesTable()
  const tag = PROJECT_TAG(projectId)
  let rows
  try {
    rows = await table.where('store').equals('semantic').toArray()
    const others = await table.toArray()
    const seen = new Set(rows.map((r) => r.id))
    for (const r of others) if (!seen.has(r.id)) rows.push(r)
  } catch {
    rows = await table.toArray().catch(() => [])
  }
  const scoped = rows.filter((r) => {
    if (projectId == null) return r.projectId == null || r.tag === tag || !r.tag?.startsWith?.('project:')
    return r.projectId === projectId || r.tag === tag
  })
  return rankMemories(scoped, query, limit)
}

/** Forget one memory by id. */
export async function forgetMemory(id) {
  const table = await _memoriesTable()
  await table.delete(id)
}

/** Drop every memory saved under one project. Returns the deleted count. */
export async function clearProjectMemories(projectId) {
  const table = await _memoriesTable()
  const tag = PROJECT_TAG(projectId)
  const rows = await table.toArray()
  const doomed = rows
    .filter((r) => r.projectId === projectId || r.tag === tag)
    .map((r) => r.id)
    .filter((id) => id != null)
  if (doomed.length) await table.bulkDelete(doomed)
  return doomed.length
}
