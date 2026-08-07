import Dexie from 'dexie'

const db = new Dexie('YogatikDB')
db.version(1).stores({
  conversations: '++id, title, updatedAt',
  messages: '++id, conversationId, role, createdAt',
  settings: 'key',
})
// v2: documents for retrieval + compound index so message loads use an index
// instead of scanning and sorting in memory.
db.version(2).stores({
  conversations: '++id, title, updatedAt',
  messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
  settings: 'key',
  documents: '++id, name, createdAt',
})

// ─── Settings (API keys, provider, theme, etc.) ───
export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key)
  return row ? row.value : fallback
}
export async function setSetting(key, value) {
  await db.settings.put({ key, value })
}
export async function getAllSettings() {
  const rows = await db.settings.toArray()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ─── Conversations ───
export async function createConversation(title = 'New Chat') {
  const id = await db.conversations.add({ title, updatedAt: Date.now() })
  return { id, title, messages: [] }
}

export async function getConversations() {
  const convs = await db.conversations.orderBy('updatedAt').reverse().toArray()
  return convs
}

export async function getConversation(id) {
  const conv = await db.conversations.get(id)
  if (!conv) return null
  const messages = await getMessages(id)
  return { ...conv, messages }
}

export async function deleteConversation(id) {
  await db.messages.where('conversationId').equals(id).delete()
  await db.conversations.delete(id)
}

export async function updateConversationTitle(id, title) {
  await db.conversations.update(id, { title, updatedAt: Date.now() })
}

// ─── Messages ───
export async function addMessage(conversationId, role, content, toolResults = null, sources = null) {
  const msg = {
    conversationId, role, content,
    toolResults: toolResults || undefined,
    sources: sources || undefined,
    createdAt: Date.now(),
  }
  const id = await db.messages.add(msg)
  await db.conversations.update(conversationId, { updatedAt: Date.now() })
  return { id, ...msg }
}

export async function getMessages(conversationId) {
  return db.messages
    .where('[conversationId+createdAt]')
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
    .toArray()
}

/** Delete messages at or after `from` (chronological position) in a conversation. */
export async function trimMessages(conversationId, from) {
  const msgs = await getMessages(conversationId)
  const doomed = msgs.slice(from).map(m => m.id).filter(id => id != null)
  if (doomed.length) await db.messages.bulkDelete(doomed)
  return doomed.length
}

// ─── Documents (local retrieval corpus) ───
export async function addDocument(doc) {
  const id = await db.documents.add({ ...doc, createdAt: Date.now() })
  return { id, ...doc }
}
export async function getDocuments() {
  return db.documents.orderBy('createdAt').reverse().toArray()
}
export async function getDocument(id) {
  return db.documents.get(id)
}
export async function deleteDocument(id) {
  return db.documents.delete(id)
}

// ─── Whole-database backup ───
// No backend means no sync: a cleared browser profile is total data loss.
export async function exportAll() {
  const [conversations, messages, documents, settings] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.documents.toArray(),
    db.settings.toArray(),
  ])
  return {
    format: 'yogatik-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations, messages, documents,
    // API keys are deliberately excluded — a backup file is not an encrypted
    // store, and users share these without thinking.
    settings: settings.filter(r => !/^apikey_|^synced_|^user$/.test(r.key)),
  }
}

/** @param {'merge'|'replace'} mode */
export async function importAll(data, mode = 'merge') {
  if (data?.format !== 'yogatik-backup') throw new Error('Not a Yogatik backup file.')
  if (data.version > 1) throw new Error('This backup was made by a newer version of Yogatik.')

  return db.transaction('rw', db.conversations, db.messages, db.documents, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([db.conversations.clear(), db.messages.clear(), db.documents.clear()])
    }

    // Conversation ids are auto-increment and will collide on merge, so remap.
    const idMap = new Map()
    for (const c of data.conversations || []) {
      const { id, ...rest } = c
      const newId = await db.conversations.add(rest)
      idMap.set(id, newId)
    }
    for (const m of data.messages || []) {
      const { id, conversationId, ...rest } = m
      const mapped = idMap.get(conversationId)
      if (mapped == null) continue        // orphaned message
      await db.messages.add({ ...rest, conversationId: mapped })
    }
    for (const d of data.documents || []) {
      const { id, ...rest } = d
      await db.documents.add(rest)
    }
    for (const row of data.settings || []) {
      if (/^apikey_|^synced_|^user$/.test(row.key)) continue   // never restore secrets
      await db.settings.put(row)
    }

    return {
      conversations: (data.conversations || []).length,
      messages: (data.messages || []).length,
      documents: (data.documents || []).length,
    }
  })
}

// ─── Export ───
export async function exportConversation(id) {
  const conv = await getConversation(id)
  if (!conv) return null
  return conv.messages.map(m =>
    `**${m.role === 'user' ? 'You' : 'Yogatik'}**:\n\n${m.content}`
  ).join('\n\n---\n\n')
}

export default db
