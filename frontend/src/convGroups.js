/**
 * Bucket conversations by recency for the sidebar.
 *
 * A flat list is unreadable past ~15 chats: every entry looks equally recent,
 * so finding yesterday's work means reading titles one by one. Pure and
 * now-injected so the boundaries are testable rather than clock-dependent.
 */

const DAY = 86400000

export const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older']

/** Local midnight, so "Today" means the calendar day, not the last 24 hours. */
function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function groupLabel(updatedAt, now = Date.now()) {
  // No timestamp at all: treat as current rather than exiling it to Older,
  // where a brand-new unsaved chat would vanish to the bottom of the list.
  if (!updatedAt) return 'Today'

  const today = startOfDay(now)
  const ts = Number(updatedAt)
  if (ts >= today) return 'Today'
  if (ts >= today - DAY) return 'Yesterday'
  if (ts >= today - 7 * DAY) return 'Previous 7 days'
  if (ts >= today - 30 * DAY) return 'Previous 30 days'
  return 'Older'
}

/**
 * @param {Array<{c: object, i: number}>} entries visibleConvs, already filtered
 * @returns {Array<{label: string, items: Array}>} only non-empty groups, in order
 */
export function groupConversations(entries, now = Date.now()) {
  const buckets = new Map(GROUP_ORDER.map(l => [l, []]))
  for (const entry of entries || []) {
    buckets.get(groupLabel(entry?.c?.updatedAt, now)).push(entry)
  }
  return GROUP_ORDER
    .map(label => ({ label, items: buckets.get(label) }))
    .filter(g => g.items.length > 0)
}
