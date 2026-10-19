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
 * Documents are de-duped by content hash (LWW on updatedAt/createdAt): an
 * incoming document whose hash already exists locally is skipped, so a second
 * device pulling the same corpus does not stack duplicates.
 *
 * Non-destructive: it never deletes local data; the caller merges the result.
 *
 * NOTE (follow-up, not this change): true multi-writer convergence needs a CRDT
 * or per-message op log. This is last-write-wins on conversation/document
 * metadata — concurrent edits to the SAME conversation on two offline devices
 * keep the newer copy's metadata, and messages union on re-import. Good enough
 * for metadata sync; not a collaborative-editing guarantee.
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
  // Document metadata LWW: skip incoming docs whose content hash is already
  // stored locally (same bytes, different auto-increment id per device).
  let incomingDocs = incoming.documents || []
  try {
    const localHashes = new Set(
      (local?.documents || []).map(d => d?.hash).filter(Boolean)
    )
    if (localHashes.size) {
      incomingDocs = incomingDocs.filter(d => {
        if (!d?.hash) return true   // no identity — keep (additive by design)
        if (!localHashes.has(d.hash)) return true
        // Same content on both sides: keep the incoming copy only if its
        // metadata is strictly newer.
        const localDoc = (local.documents || []).find(l => l?.hash === d.hash)
        return (d.updatedAt || d.createdAt || 0) > (localDoc?.updatedAt || localDoc?.createdAt || 0)
      })
    }
  } catch { /* identity problems must never block a sync */ }
  return {
    ...incoming,
    conversations: keepConvs,
    messages: keepMessages,
    documents: incomingDocs,
    // projects/settings pass through unchanged — importAll de-dups
    // settings by key and projects are additive by design.
  }
}

/** Count of conversations that would actually be imported (for status/UX). */
export function countNewConversations(incoming, local) {
  return selectIncoming(incoming, local).conversations.length
}

/**
 * Last-write-wins winner for one conversation existing on both sides.
 * Newer updatedAt wins; ties keep local (never clobber on equal clocks).
 */
export function pickConversationWinner(localConv, remoteConv) {
  if (!localConv) return remoteConv
  if (!remoteConv) return localConv
  return (remoteConv.updatedAt || 0) > (localConv.updatedAt || 0) ? remoteConv : localConv
}

/**
 * Last-write-wins winner for one document (identity = content hash).
 * Newer updatedAt/createdAt wins; ties keep local.
 */
export function pickDocumentWinner(localDoc, remoteDoc) {
  if (!localDoc) return remoteDoc
  if (!remoteDoc) return localDoc
  const r = remoteDoc.updatedAt || remoteDoc.createdAt || 0
  const l = localDoc.updatedAt || localDoc.createdAt || 0
  return r > l ? remoteDoc : localDoc
}

/**
 * Merge two whole snapshots with last-write-wins on conversation/document
 * metadata and a union on messages (keyed by id when present, else content).
 * Pure — the caller persists the result. See the selectIncoming note about
 * CRDT as the follow-up for true multi-writer convergence.
 */
export function mergeSnapshotsLWW(local = {}, remote = {}) {
  const localConvs = local.conversations || []
  const remoteConvs = remote.conversations || []
  const localMsgs = local.messages || []
  const remoteMsgs = remote.messages || []

  const localBySig = new Map(localConvs.map(c => [conversationSignature(c, localMsgs), c]))
  const mergedConvs = [...localConvs]
  const extraMsgs = []
  for (const rc of remoteConvs) {
    const sig = conversationSignature(rc, remoteMsgs)
    const existing = localBySig.get(sig)
    if (!existing) {
      mergedConvs.push(rc)
      extraMsgs.push(...remoteMsgs.filter(m => m.conversationId === rc.id))
      continue
    }
    const winner = pickConversationWinner(existing, rc)
    if (winner === rc) {
      const idx = mergedConvs.indexOf(existing)
      if (idx !== -1) mergedConvs[idx] = { ...rc, id: existing.id }
    }
    // Messages union regardless of which metadata won.
    const localSet = new Set(localMsgs.filter(m => m.conversationId === existing.id).map(m => m.id ?? `${m.role}:${m.content}`))
    for (const m of remoteMsgs.filter(m => m.conversationId === rc.id)) {
      const key = m.id ?? `${m.role}:${m.content}`
      if (!localSet.has(key)) extraMsgs.push({ ...m, conversationId: existing.id })
    }
  }

  const localDocs = local.documents || []
  const remoteDocs = remote.documents || []
  const docByHash = new Map(localDocs.map(d => [d?.hash || `id:${d?.id}`, d]))
  const mergedDocs = [...localDocs]
  for (const rd of remoteDocs) {
    const key = rd?.hash || `id:${rd?.id}`
    const existing = docByHash.get(key)
    if (!existing) { mergedDocs.push(rd); docByHash.set(key, rd); continue }
    if (pickDocumentWinner(existing, rd) === rd) {
      const idx = mergedDocs.indexOf(existing)
      if (idx !== -1) mergedDocs[idx] = { ...rd, id: existing.id }
      docByHash.set(key, mergedDocs[idx])
    }
  }

  return {
    format: 'yogatik-backup',
    version: 1,
    conversations: mergedConvs,
    messages: [...localMsgs, ...extraMsgs],
    documents: mergedDocs,
  }
}
