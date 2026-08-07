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

// ─── Export ───
export async function exportConversation(id) {
  const conv = await getConversation(id)
  if (!conv) return null
  return conv.messages.map(m =>
    `**${m.role === 'user' ? 'You' : 'Yogatik'}**:\n\n${m.content}`
  ).join('\n\n---\n\n')
}

export default db
