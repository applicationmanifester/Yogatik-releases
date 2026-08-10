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

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
