import Dexie from 'dexie'

const db = new Dexie('YogatikDB')
db.version(1).stores({
  conversations: '++id, title, updatedAt',
  messages: '++id, conversationId, role, createdAt',
  settings: 'key',
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
  const messages = await db.messages.where('conversationId').equals(id).sortBy('createdAt')
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
  return db.messages.where('conversationId').equals(conversationId).sortBy('createdAt')
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
