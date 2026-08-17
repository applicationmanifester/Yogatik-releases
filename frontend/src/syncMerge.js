/**
 * Conflict-free-ish merge for cross-device conversation sync.
 *
 * The problem: conversation ids are device-local auto-increments, and
 * db.importAll('merge') always ADDS, so pulling the cloud snapshot on a second
 * device — then syncing back — duplicates the entire history on every round
 * trip. This module gives conversations a stable, content-derived identity and
 * filters an incoming snapshot down to only what is genuinely new (last-write-
 * wins on updatedAt when the same conversation exists on both sides).
 *
 * Pure functions, no Dexie/Firestore — fully unit-testable.
 */

/**
 * Stable cross-device signature for a conversation. Auto-increment ids differ
 * per device, so identity is derived from immutable-ish content: an explicit
 * syncId if present, else title + createdAt + the first message's text.
 */
export function conversationSignature(conv, messages = []) {
  if (conv?.syncId) return `id:${conv.syncId}`
  const first = messages.find(m => m.conversationId === conv.id) || messages[0]
  const seed = [
    (conv?.title || '').trim().toLowerCase().slice(0, 80),
    conv?.createdAt || '',
    (first?.content && typeof first.content === 'string' ? first.content : '').trim().slice(0, 120),
  ].join('|')
  return `sig:${seed}`
}

function indexBySignature(snapshot) {
  const byConv = new Map()
  for (const c of snapshot.conversations || []) {
    byConv.set(conversationSignature(c, snapshot.messages || []), c)
  }
  return byConv
}

/**
 * Return the subset of `incoming` that should be imported into `local`:
 *  - conversations not present locally, and
 *  - conversations present on both where the incoming copy is strictly newer
 *    (updatedAt) AND has more messages (a safety guard against clobbering a
 *    longer local thread with a stale short one).
 * Messages are carried along for exactly the selected conversations.
 *
 * Non-destructive: it never deletes local data; the caller merges the result.
 */
export function selectIncoming(incoming, local) {
  const localBySig = indexBySignature(local || { conversations: [], messages: [] })
  const keepConvs = []
  const keepIds = new Set()

  for (const c of incoming.conversations || []) {
    const sig = conversationSignature(c, incoming.messages || [])
    const existing = localBySig.get(sig)
    if (!existing) { keepConvs.push(c); keepIds.add(c.id); continue }

    const incomingCount = (incoming.messages || []).filter(m => m.conversationId === c.id).length
    const localCount = (local.messages || []).filter(m => m.conversationId === existing.id).length
    const newer = (c.updatedAt || 0) > (existing.updatedAt || 0)
    if (newer && incomingCount > localCount) { keepConvs.push(c); keepIds.add(c.id) }
  }

  const keepMessages = (incoming.messages || []).filter(m => keepIds.has(m.conversationId))
  return {
    ...incoming,
    conversations: keepConvs,
    messages: keepMessages,
    // documents/projects/settings pass through unchanged — importAll de-dups
    // settings by key and documents are additive by design.
  }
}

/** Count of conversations that would actually be imported (for status/UX). */
export function countNewConversations(incoming, local) {
  return selectIncoming(incoming, local).conversations.length
}
