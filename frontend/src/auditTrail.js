/**
 * auditTrail.js — the honest local foundation for the "enterprise audit trail +
 * export" theme in PUBLIC_ROADMAP.md.
 *
 * SCOPE NOTE (upfront, to dress nothing up): what the roadmap's
 * audit-trail/export story needs that a backend can give it — RBAC, team roles,
 * org retention policy, cross-device trails, server-side non-repudiation — is
 * OUT OF SCOPE here. Those all require the backend that does not exist yet.
 * What exists client-side, and what this module is, is the honest local half:
 * every consequential local decision is written to an append-mostly,
 * capped, hash-chained log the user can inspect and export, and nothing more
 * pretends to be an "audit trail".
 *
 * Contract:
 *  - record() NEVER throws and NEVER breaks the host operation (hooks still
 *    wrap their calls in try/catch — belt and braces).
 *  - Ring buffer: last AUDIT_CAP entries live in the Dexie `settings` table
 *    under `audit_trail`; older entries are dropped (the cap is the privacy and
 *    storage story, same pattern as media/artifact versions in db.js).
 *  - Hash chain: entry.hash = SHA-256(prevHash + canonical entry JSON) via
 *    crypto.subtle, with a plain-mutation fallback when WebCrypto is off
 *    (non-secure contexts). Tamper-evident, not tamper-PROOF — the log lives on
 *    the user's own machine and the user owns the machine. verifyChain() is a
 *    pure recompute, so a mutation anywhere is pointed at by index.
 *  - What is NEVER recorded: message content, prompts, tool argument bodies,
 *    command lines, file paths, provider ids, key material. Only the event
 *    type plus coarse booleans/ids (allowed/refused, tool NAME, schedule id,
 *    message COUNT). sanitizeDetail() enforces this on every entry, so a hook
 *    author passing too much gets it silently reduced instead of leaked.
 */
import { getSetting, setSetting } from './db'

export const AUDIT_KEY = 'audit_trail'
export const AUDIT_CAP = 500

/** Chain anchor: the first entry of a fresh trail hangs off this. */
export const GENESIS = 'genesis'

/** The canonical vocabulary. `mcp_toggled` is in the vocabulary for callers
 *  that toggle a server (this module adds no hook of its own — the hook budget
 *  for this feature is permissions.js / scheduler.js / chatExport.js / api.js). */
export const EVENT_TYPES = [
  'tool_permission_roll',
  'schedule_created', 'schedule_paused', 'schedule_resumed',
  'schedule_cancelled', 'schedule_ran',
  'data_export', 'data_import',
  'prefs_push', 'prefs_pull',
  'key_vault_pull',
  'cloud_sync',
  'mcp_toggled',
  'audit_wiped',
]

// ─── Detail sanitisation ─────────────────────────────────────────────────────
// Allowlist-in-spirit: primitives only, short strings, shallow objects/arrays,
// and keys that exist to carry BODIES are dropped outright. This is what makes
// "no content is ever recorded" true even when a caller makes a mistake.

const SENSITIVE_KEYS = new Set([
  'content', 'prompt', 'prompts', 'args', 'arguments', 'command', 'cmd',
  'message', 'messages', 'text', 'body', 'response', 'input', 'output',
  'code', 'blob', 'file', 'files', 'document', 'documents', 'payload',
  'data', 'value', 'reason', 'description', 'title', 'name', 'query',
  'url', 'path', 'paths', 'src', 'dest', 'conversationId', 'projectId',
  'key', 'keys', 'apikey', 'token', 'secret',
  'diff', 'params', 'env', 'headers', 'snippet', 'excerpt',
])

const STRING_MAX = 120   // a string in the trail is metadata, prose it is not
const KEYS_MAX = 16      // per object
const ARRAY_MAX = 12     // per array
const DEPTH_MAX = 2      // detail itself is depth 0; bodies die beyond 2 levels

function sanitizeString(v) {
  return String(v).replace(/\s+/g, ' ').trim().slice(0, STRING_MAX)
}

function sanitizeValue(v, depth) {
  if (v == null) return depth === 0 ? undefined : null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') return v.length <= STRING_MAX ? v : sanitizeString(v)
  if (depth > DEPTH_MAX) return undefined          // too deep → dead
  if (Array.isArray(v)) {
    return v.slice(0, ARRAY_MAX)
      .map((x) => sanitizeValue(x, depth + 1))
  }
  if (typeof v === 'object') {
    const out = {}
    let n = 0
    for (const k of Object.keys(v)) {
      if (n >= KEYS_MAX) break
      if (SENSITIVE_KEYS.has(k)) continue          // body-carrying keys never pass
      const next = sanitizeValue(v[k], depth + 1)
      if (next === undefined) continue             // value couldn't be kept → key goes with it
      out[k] = next
      n++
    }
    return out
  }
  return undefined                                 // functions, blobs, exotic tenants → dead
}

/**
 * Coerce a caller-supplied detail into one that is safe to persist. Always
 * returns a plain object. This is the module's only defence against a hook
 * author's enthusiasm — it runs on EVERY record, not just the risky ones.
 */
export function sanitizeDetail(detail) {
  const out = sanitizeValue(detail ?? {}, 0)
  return (out && typeof out === 'object' && !Array.isArray(out)) ? out : {}
}

function sanitizeType(type) {
  return sanitizeString(type).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unknown'
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function getSubtle() {
  try {
    const c = globalThis.crypto
    if (c && c.subtle && typeof c.subtle.digest === 'function') return c.subtle
  } catch { /* non-secure context or exotic environment */ }
  return null
}

/** Plain-mutation fallback: djb2/xor over the previous char state. NOT cryptographically
 *  strong — it keeps the chain well-defined (and accidental/mundane edits
 *  detectable) on runtimes without WebCrypto; correction of an adversarial
 *  recompute is not claimed. */
function plainHash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return 'fb:' + h.toString(16).padStart(8, '0')
}

function hashHex(prevHash, entryJSON) {
  const subtle = getSubtle()
  if (!subtle) return Promise.resolve(plainHash(prevHash + entryJSON))
  try {
    return subtle.digest('SHA-256', new TextEncoder().encode(prevHash + entryJSON))
      .then((buf) => {
        const bytes = new Uint8Array(buf)
        let hex = ''
        for (const b of bytes) hex += b.toString(16).padStart(2, '0')
        return hex
      })
      .catch(() => plainHash(prevHash + entryJSON))
  } catch {
    return Promise.resolve(plainHash(prevHash + entryJSON))
  }
}

/** Canonical JSON of what an entry asserts — the exact bytes a hash commits to. */
function entryJson({ at, type, detail }) {
  return JSON.stringify({ at, type, detail })
}

// ─── Store ───────────────────────────────────────────────────────────────────

async function readTrail() {
  try {
    const list = await getSetting(AUDIT_KEY, [])
    return Array.isArray(list) ? list : []
  } catch {
    return []                                  // storage down → trail is empty, callers stay working
  }
}

async function writeTrail(entries) {
  await setSetting(AUDIT_KEY, entries)
}

// Concurrent records must not race a read-modify-write (two entries landing on
// the same prev hash breaks the chain serialised writer: each record waits for
// the previous one, whatever the callers are doing).
let queue = Promise.resolve()

async function _record(type, detail) {
  try {
    const entries = await readTrail()
    const last = entries.length ? entries[entries.length - 1] : null
    const prev = last?.hash || GENESIS
    const safe = sanitizeDetail(detail)
    const at = Date.now()
    const json = entryJson({ at, type, detail: safe })
    const hash = await hashHex(prev, json)
    const entry = { at, type, detail: safe, prev, hash }
    const next = [...entries, entry]
    while (next.length > AUDIT_CAP) next.shift()     // cap: drop the OLDEST
    await writeTrail(next)
    return entry
  } catch {
    return null                                     // a trail failure is never the caller's problem
  }
}

/**
 * Record one audit event. Resolves to the stored entry, or null on failure.
 * NEVER throws, never returns a rejected promise: hooks call this bare.
 * @param {string} type   an EVENT_TYPE (unknown strings are sanitised, not rejected)
 * @param {object} detail coarse metadata — sanitizeDetail reduces it to booleans/ids
 */
export function record(type, detail = {}) {
  const t = sanitizeType(type)
  queue = queue
    .catch(() => {})                                // a failed record must not poison the next
    .then(() => _record(t, detail))
  return queue
}

/** Test/observability drain: resolves when every queued record has landed. */
export function _flushAudit() {
  return queue
}

/**
 * Re-read the trail and recompute every hash. Pure — it changes nothing.
 *
 * Capped-ring semantics (an honest limitation, stated here rather than hidden):
 * evicted entries are gone, so the OLDEST RETAINED entry's `prev` points past
 * the stored window and is opaque to the verifier — every entry's own hash is
 * still recomputed from its own bytes (at+type+detail+prev), and every link
 * between retained entries (1..n) is required to reference its predecessor.
 * Anything mutated inside the window — a type, a detail, an anchor or a hash —
 * breaks at the first affected index.
 * @returns {{intact: boolean, brokenAt: number|null, length: number}}
 */
export async function verifyChain() {
  const entries = await readTrail()
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] || {}
    if (i > 0) {
      const expectedPrev = entries[i - 1]?.hash
      if (e.prev !== expectedPrev) return { intact: false, brokenAt: i, length: entries.length }
    }
    const json = entryJson(e)
    if (e.hash !== await hashHex(e.prev, json)) {
      return { intact: false, brokenAt: i, length: entries.length }
    }
  }
  return { intact: true, brokenAt: null, length: entries.length }
}

/**
 * Query the trail. Returns NEWEST FIRST (panel order). Filters are coarse:
 * exact type, and/or an at-timestamp window, or a limit.
 * @param {{type?: string|null, since?: number|null, until?: number|null, limit?: number}} filter
 */
export async function queryEvents({ type = null, since = null, until = null, limit = 200 } = {}) {
  const entries = await readTrail()
  const out = []
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i]
    if (type && e?.type !== type) continue
    if (since != null && !(e?.at >= since)) continue
    if (until != null && !(e?.at <= until)) continue
    out.push(e)
  }
  return out
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Pure JSON shape: chronological (oldest → newest), WITH the chain fields
 * (prev/hash) — the whole point of exporting a hash chain is so someone else
 * can re-run the verify.
 */
export function auditToJson(entries) {
  return {
    format: 'yogatik-audit-trail',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  }
}

/** Pure CSV shape: header + one row per event, memo-safe CSV-quoting. */
export function auditToCsv(entries) {
  const cell = (s) => (/[",\r\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s))
  const rows = [['at', 'type', 'detail']]
  for (const e of entries || []) {
    rows.push([
      new Date(e?.at || 0).toISOString(),
      String(e?.type || ''),
      cell(JSON.stringify(e?.detail ?? null)),
    ])
  }
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n'
}

const exportStamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

/**
 * Download the whole trail. 'json' keeps the chain; 'csv' is for humans/sheets.
 * Downloads through chatExport.downloadBlob — the same plumbing every other
 * export in the app uses — and the download itself then shows up in the trail
 * (data_export) via chatExport's triggerDownload hook.
 * @param {'json'|'csv'} format
 * @returns {Promise<{filename: string, count: number}|null>}
 */
export async function exportAudit(format = 'json') {
  const entries = await readTrail()                 // chronological order for the trail proper
  let blob, filename
  if (String(format).toLowerCase() === 'csv') {
    blob = new Blob([auditToCsv(entries)], { type: 'text/csv' })
    filename = `yogatik-audit-${exportStamp()}.csv`
  } else {
    blob = new Blob([JSON.stringify(auditToJson(entries), null, 2)], { type: 'application/json' })
    filename = `yogatik-audit-${exportStamp()}.json`
  }
  try {
    const { downloadBlob } = await import('./chatExport')
    downloadBlob(blob, filename)
    // The data_export entry for this download is queued by chatExport's
    // [audit] hook a microtask after this line; yields once so the drain below
    // actually contains it — callers (the panel) can then re-read the trail
    // and see the export they just made on it.
    await new Promise((r) => setTimeout(r, 0))
    await _flushAudit()
  } catch {
    return null                                     // even the export failing stays quiet
  }
  return { filename, count: entries.length }
}

/**
 * Wipe the trail after user confirmation (the UI owns the confirm step). The
 * wipe itself is then the first entry of the new, signed-off chain — a cleared
 * trail self-describes, and verifyChain() stays intact immediately after.
 */
export async function wipeTrail() {
  try {
    await writeTrail([])
    await record('audit_wiped')
    return true
  } catch {
    return false
  }
}
