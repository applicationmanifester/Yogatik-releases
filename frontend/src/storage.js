/**
 * Storage durability.
 *
 * Everything this app owns — conversations, documents, API keys, cached model
 * weights — lives in the browser. By default that storage is "best-effort": the
 * browser may evict the whole origin when the disk gets tight, and the user
 * loses their history with no warning and no undo. persist() asks for the
 * "persistent" bucket instead, which is only cleared deliberately.
 *
 * Chrome grants it silently for installed/engaged sites, Firefox prompts,
 * Safari decides on its own. A refusal is not an error — it just means the old
 * best-effort behaviour, so nothing here throws.
 */

export async function isPersisted() {
  try { return !!(await navigator.storage?.persisted?.()) } catch { return false }
}

/** @returns {Promise<boolean>} whether storage is persistent now. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * @returns {Promise<{used:number, quota:number, pct:number, persisted:boolean}|null>}
 */
export async function storageReport() {
  try {
    if (!navigator.storage?.estimate) return null
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return {
      used: usage,
      quota,
      pct: quota ? Math.min(100, (usage / quota) * 100) : 0,
      persisted: await isPersisted(),
    }
  } catch {
    return null
  }
}

/**
 * Backup-nudge policy. When storage is only best-effort the browser can evict
 * everything silently, so past a few conversations we prompt the user to export
 * a backup — but not more than once per interval, and never once persistence is
 * granted. Pure function so it is unit-testable.
 *
 * @returns {boolean} whether to surface a backup nudge now.
 */
const NUDGE_MIN_CONVERSATIONS = 5
const NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // weekly at most

export function shouldNudgeBackup({ persisted, conversationCount = 0, lastNudgeAt = 0, lastBackupAt = 0, now = Date.now() } = {}) {
  if (persisted) return false                              // durable — no risk
  if (conversationCount < NUDGE_MIN_CONVERSATIONS) return false
  if (lastBackupAt && now - lastBackupAt < NUDGE_INTERVAL_MS) return false
  if (lastNudgeAt && now - lastNudgeAt < NUDGE_INTERVAL_MS) return false
  return true
}

const NUDGE_STORE = 'yogatik.backupNudge'
function readNudge() {
  try { return JSON.parse(localStorage.getItem(NUDGE_STORE) || '{}') } catch { return {} }
}
function writeNudge(patch) {
  try { localStorage.setItem(NUDGE_STORE, JSON.stringify({ ...readNudge(), ...patch })) } catch { /* private */ }
}
export function getBackupTimestamps() { return readNudge() }
export function markBackupNudged(now = Date.now()) { writeNudge({ lastNudgeAt: now }) }
export function markBackedUp(now = Date.now()) { writeNudge({ lastBackupAt: now }) }

/** Convenience: reads persistence + stored timestamps and applies the policy. */
export async function checkBackupNudge(conversationCount) {
  const persisted = await isPersisted()
  const { lastNudgeAt = 0, lastBackupAt = 0 } = readNudge()
  return shouldNudgeBackup({ persisted, conversationCount, lastNudgeAt, lastBackupAt })
}

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

/**
 * Storage optimizer: purges obsolete traces and media blobs older than maxAgeDays
 */
export async function optimizeAndCleanStorage({ maxAgeDays = 30 } = {}) {
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
  let purgedTraces = 0
  let purgedMedia = 0

  try {
    const { db } = await import('./db')
    if (db?.traces) {
      purgedTraces = await db.traces.where('createdAt').below(cutoff).delete()
    }
    if (db?.media) {
      purgedMedia = await db.media.where('createdAt').below(cutoff).delete()
    }
  } catch {}

  return { purgedTraces, purgedMedia }
}

