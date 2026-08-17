/**
 * Four-store memory framework — the companion upgrade over the flat `memory`
 * tool (facts, 200-cap). Structures durable memory into four kinds and ranks
 * them by salience + recency so the prompt gets the *relevant* few, not the last
 * N. Pure functions here (scoring, selection, decay, milestones); persistence
 * lives in db.js tables that mirror this shape. All on-device, user-owned.
 *
 *   Episodic   — dated events ("started new job", 2026-08-12). Decays with time
 *                unless high-salience; source of proactive check-ins + milestones.
 *   Semantic   — stable facts (name, city, preferences). No decay.
 *   Procedural — interaction preferences (reply length, tone, favoured tools),
 *                usually derived implicitly from behaviour.
 *   Emotional  — sentiment/engagement trend + sensitive topics. LOCAL-ONLY by
 *                default; drives boundary + engagement, never synced unless opted.
 */

export const STORES = ['episodic', 'semantic', 'procedural', 'emotional']

const DAY = 24 * 60 * 60 * 1000
const HALF_LIFE_DAYS = { episodic: 30, semantic: Infinity, procedural: 90, emotional: 14 }

/** Exponential recency weight in [0,1]; semantic never decays. */
export function recencyWeight(store, at, now = Date.now()) {
  const hl = HALF_LIFE_DAYS[store]
  if (!isFinite(hl)) return 1
  const ageDays = Math.max(0, (now - (at || 0)) / DAY)
  return Math.pow(0.5, ageDays / hl)
}

/**
 * Salience score for ranking. Combines the item's intrinsic importance (0–1),
 * how often it has been referenced, and recency decay for its store.
 */
export function salience(item, now = Date.now()) {
  const base = clamp01(item.importance ?? 0.5)
  const refs = Math.min(1, (item.refCount || 0) / 5) // caps the boost at 5 references
  const recency = recencyWeight(item.store, item.at, now)
  // Weighted blend: importance dominates, references and recency modulate.
  return clamp01(0.5 * base + 0.2 * refs + 0.3 * recency)
}

/** Simple keyword overlap relevance in [0,1] (BM25 lives in retrieval.js). */
export function relevance(item, query) {
  const q = tokens(query)
  if (!q.size) return 0
  const t = tokens(item.text)
  let hit = 0
  for (const w of q) if (t.has(w)) hit++
  return hit / q.size
}

/**
 * Select the top-K memories to inject for a turn: relevance-gated, salience-
 * ranked, with per-store caps so emotional/procedural context can't crowd out
 * facts. Returns items sorted best-first.
 */
export function selectForPrompt(items, query, { k = 12, perStoreCap = 5, now = Date.now() } = {}) {
  const scored = items.map(it => ({
    it,
    score: 0.6 * relevance(it, query) + 0.4 * salience(it, now),
  }))
  scored.sort((a, b) => b.score - a.score)
  const counts = Object.create(null)
  const out = []
  for (const { it, score } of scored) {
    if (score <= 0) continue
    counts[it.store] = (counts[it.store] || 0)
    if (counts[it.store] >= perStoreCap) continue
    counts[it.store]++
    out.push(it)
    if (out.length >= k) break
  }
  return out
}

/** Format selected memories into a compact system-prompt block. */
export function memoryPromptBlock(items) {
  if (!items?.length) return ''
  const byStore = { episodic: [], semantic: [], procedural: [], emotional: [] }
  for (const it of items) (byStore[it.store] || byStore.semantic).push(it.text)
  const lines = []
  if (byStore.semantic.length) lines.push('Facts: ' + byStore.semantic.join('; '))
  if (byStore.episodic.length) lines.push('Recent events: ' + byStore.episodic.join('; '))
  if (byStore.procedural.length) lines.push('Preferences: ' + byStore.procedural.join('; '))
  // Emotional context is summarised, not quoted, to stay gentle and private.
  if (byStore.emotional.length) lines.push('Emotional context: ' + byStore.emotional.join('; '))
  return '\n\nWHAT YOU REMEMBER ABOUT THIS PERSON:\n' + lines.join('\n')
}

/**
 * Milestones from episodic memory (anniversaries of notable events) — the seed
 * for memory-based proactive check-ins ("a year ago you started your new job").
 */
export function dueMilestones(episodic, now = Date.now(), windowDays = 1) {
  const out = []
  for (const it of episodic || []) {
    if (!it.at || (it.importance ?? 0.5) < 0.6) continue
    const ageDays = (now - it.at) / DAY
    const nearestAnniv = Math.round(ageDays / 365)
    if (nearestAnniv < 1) continue
    const diff = Math.abs(ageDays - nearestAnniv * 365)
    if (diff <= windowDays) out.push({ ...it, years: nearestAnniv })
  }
  return out
}

// ── persistence (Dexie `memories` table, db v5) ──
// Kept separate from the pure scoring above so tests never touch IndexedDB.
// Lazy db import avoids pulling Dexie into pure-logic unit tests.

const VALID = new Set(STORES)
const CAP = 500 // hard ceiling; low-salience items are pruned past this

async function _db() { return (await import('./db')).db }

/** Add a memory to a store. Returns the stored record (with id). */
export async function remember({ store = 'semantic', text, importance = 0.5, tag, at = Date.now() }) {
  if (!VALID.has(store) || !String(text || '').trim()) return null
  const db = await _db()
  // De-dupe exact text within a store; bump refCount + importance instead.
  const dupes = await db.memories.where('store').equals(store).toArray()
  const existing = dupes.find(m => m.text.trim().toLowerCase() === text.trim().toLowerCase())
  if (existing) {
    existing.refCount = (existing.refCount || 0) + 1
    existing.importance = clamp01(Math.max(existing.importance ?? 0.5, importance))
    existing.at = at
    await db.memories.put(existing)
    return existing
  }
  const rec = { store, text: text.trim(), importance: clamp01(importance), tag: tag || undefined, refCount: 0, at }
  rec.id = await db.memories.add(rec)
  await _pruneIfNeeded(db)
  return rec
}

/** All memories, or one store. */
export async function allMemories(store = null) {
  const db = await _db()
  return store ? db.memories.where('store').equals(store).toArray() : db.memories.toArray()
}

/** Forget by id. */
export async function forget(id) {
  const db = await _db()
  await db.memories.delete(id)
}

/**
 * Recall the best memories for a query and bump their refCount (they proved
 * useful) — feeds selectForPrompt, then persists the usage signal.
 */
export async function recallForPrompt(query, opts = {}) {
  const items = await allMemories()
  const selected = selectForPrompt(items, query, opts)
  const db = await _db()
  await Promise.all(selected.map(it => it.id != null
    ? db.memories.update(it.id, { refCount: (it.refCount || 0) + 1 })
    : null))
  return selected
}

/** Build the injectable prompt block straight from storage (or '' if empty). */
export async function memoryBlockFromStores(query = '') {
  const items = await allMemories()
  if (!items.length) return ''
  const selected = query ? selectForPrompt(items, query) : items
  return memoryPromptBlock(selected)
}

async function _pruneIfNeeded(db) {
  const count = await db.memories.count()
  if (count <= CAP) return
  const all = await db.memories.toArray()
  const now = Date.now()
  all.sort((a, b) => salience(a, now) - salience(b, now)) // lowest salience first
  const drop = all.slice(0, count - CAP).map(m => m.id).filter(id => id != null)
  if (drop.length) await db.memories.bulkDelete(drop)
}

// ── helpers ──
function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)) }
function tokens(s) {
  return new Set(String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
}
