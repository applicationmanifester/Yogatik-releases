import Dexie from 'dexie'

export const db = new Dexie('YogatikDB')
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
// v3: projects group conversations and documents, each with its own persona
// and tool selection.
db.version(3).stores({
  conversations: '++id, title, updatedAt, projectId',
  messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
  settings: 'key',
  documents: '++id, name, createdAt, projectId',
  projects: '++id, name, createdAt',
})
// v4: rendered media (video/audio blobs). A blob: URL dies on reload, so the
// bytes themselves have to live somewhere or the video the user just made is
// gone the moment they refresh.
db.version(4).stores({
  conversations: '++id, title, updatedAt, projectId',
  messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
  settings: 'key',
  documents: '++id, name, createdAt, projectId',
  projects: '++id, name, createdAt',
  media: '++id, createdAt',
})
// v5: structured, four-store memory (episodic/semantic/procedural/emotional).
// The flat `user_memory` settings blob stays put; this table is the richer,
// salience-ranked companion memory (see memory4.js). `store` is indexed so a
// single kind can be listed/decayed without scanning everything.
db.version(5).stores({
  conversations: '++id, title, updatedAt, projectId',
  messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
  settings: 'key',
  documents: '++id, name, createdAt, projectId',
  projects: '++id, name, createdAt',
  media: '++id, createdAt',
  memories: '++id, store, at',
})
// v6: local agent execution traces & step replay
db.version(6).stores({
  conversations: '++id, title, updatedAt, projectId',
  messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
  settings: 'key',
  documents: '++id, name, createdAt, projectId',
  projects: '++id, name, createdAt',
  media: '++id, createdAt',
  memories: '++id, store, at',
  traces: '++id, conversationId, tool, createdAt, [conversationId+createdAt]',
})

// A backgrounded/hidden tab (mobile especially) can have IndexedDB closed out
// from under us; the next Dexie call throws DatabaseClosedError / InvalidStateError
// ("Database is closing"). At startup this surfaced as a bogus "sign-in failed"
// modal. isDbClosedError lets callers treat it as transient; reopen + retry once.
export function isDbClosedError(e) {
  const s = `${e?.name || ''} ${e?.message || e || ''}`
  return /DatabaseClosed|Database is closing|connection is closing|InvalidStateError/i.test(s)
}
async function withReopen(fn) {
  try { return await fn() }
  catch (e) {
    if (!isDbClosedError(e)) throw e
    try { if (!db.isOpen()) await db.open() } catch {}
    return await fn()
  }
}
// Re-open as soon as the tab is visible again so the first post-resume op succeeds.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !db.isOpen()) db.open().catch(() => {})
  })
}

// ─── Media (rendered video) ───
const MEDIA_KEEP = 10          // newest N kept; older renders are disposable

export async function saveMedia({ blob, mime, filename, meta = {} }) {
  const id = await db.media.add({ blob, mime, filename, meta, createdAt: Date.now() })
  // Videos are megabytes. Without a cap, IndexedDB fills up and every later
  // write starts failing with QuotaExceededError.
  const all = await db.media.orderBy('createdAt').reverse().toArray()
  const toDelete = all.slice(MEDIA_KEEP).map(m => m.id)
  if (toDelete.length > 0) await db.media.bulkDelete(toDelete)
  return id
}

export async function getMedia(id) {
  return db.media.get(Number(id))
}

export async function deleteMedia(id) {
  return db.media.delete(Number(id))
}

// ─── Agent Traces & Replay Log ───
export async function logAgentTrace(trace = {}) {
  try {
    return await withReopen(() => db.traces.add({
      ...trace,
      createdAt: trace.createdAt || Date.now(),
    }))
  } catch { return null }
}

export async function getAgentTraces(conversationId, limit = 50) {
  try {
    if (!conversationId) return []
    return await withReopen(() =>
      db.traces.where('conversationId').equals(conversationId).reverse().limit(limit).toArray()
    )
  } catch { return [] }
}

// ─── Settings (API keys, provider, theme, etc.) ───
// Provider API keys (`apikey_*`) are transparently sealed by the desktop OS key
// vault (safeStorage) at rest. Off-desktop / in tests the helpers pass the value
// through unchanged, and legacy plaintext + cloud-synced keys keep working.
const isApiKeySetting = (key) => typeof key === 'string' && key.startsWith('apikey_')

export async function getSetting(key, fallback = null) {
  const row = await withReopen(() => db.settings.get(key))
  // A row holding null must still yield the fallback: `getSetting(k, '')`
  // returning null put null into controlled inputs. false/0 are kept.
  let value = row && row.value != null ? row.value : fallback
  if (isApiKeySetting(key) && typeof value === 'string' && value) {
    try {
      const { openKey } = await import('./desktopKeychain.js')
      const opened = await openKey(value)
      value = opened == null ? fallback : opened
    } catch { /* keep raw value if the vault helper is unavailable */ }
  }
  return value
}
export async function setSetting(key, value) {
  let toStore = value
  if (isApiKeySetting(key) && typeof value === 'string' && value) {
    try {
      const { sealKey } = await import('./desktopKeychain.js')
      toStore = await sealKey(value)
    } catch { /* store plaintext if the vault helper is unavailable */ }
  }
  await withReopen(() => db.settings.put({ key, value: toStore }))
}
export async function getAllSettings() {
  const rows = await withReopen(() => db.settings.toArray())
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
// ─── Conversations ───
export async function createConversation(title = 'New Chat', projectId = null, provider = null, model = null, settings = null) {
  return withReopen(async () => {
    const id = await db.conversations.add({ title, updatedAt: Date.now(), projectId, provider, model, settings })
    return { id, title, projectId, provider, model, settings, messages: [] }
  })
}

export async function getConversations(projectId) {
  const convs = await withReopen(() => db.conversations.orderBy('updatedAt').reverse().toArray())
  if (projectId === undefined) return convs
  return convs.filter(c => (c.projectId ?? null) === (projectId ?? null))
}

export async function getConversation(id) {
  return withReopen(async () => {
    const conv = await db.conversations.get(id)
    if (!conv) return null
    const messages = await getMessages(id)
    return { ...conv, messages }
  })
}

export async function deleteConversation(id) {
  return withReopen(async () => {
    await db.messages.where('conversationId').equals(id).delete()
    await db.conversations.delete(id)
  })
}

export async function updateConversationTitle(id, title) {
  return withReopen(() => db.conversations.update(id, { title, updatedAt: Date.now() }))
}

export async function updateConversationModel(id, provider, model, settings = null) {
  const updateData = { provider, model }
  if (settings !== null) updateData.settings = settings
  return withReopen(() => db.conversations.update(id, updateData))
}

// ─── Messages ───
export async function addMessage(conversationId, role, content, toolResults = null, sources = null) {
  return withReopen(async () => {
    const msg = {
      conversationId, role, content,
      toolResults: toolResults || undefined,
      sources: sources || undefined,
      createdAt: Date.now(),
    }
    const id = await db.messages.add(msg)
    await db.conversations.update(conversationId, { updatedAt: Date.now() })
    return { id, ...msg }
  })
}

export async function getMessages(conversationId) {
  return withReopen(() => db.messages
    .where('[conversationId+createdAt]')
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
    .toArray())
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
export async function getDocuments(projectId) {
  const all = await db.documents.orderBy('createdAt').reverse().toArray()
  // Project scoping keeps retrieval focused: a work PDF should not answer a
  // question asked inside a personal project.
  if (projectId === undefined) return all
  return all.filter(d => (d.projectId ?? null) === (projectId ?? null))
}
export async function getDocument(id) {
  return db.documents.get(id)
}
export async function deleteDocument(id) {
  return db.documents.delete(id)
}

// ─── Projects ───
export async function createProject(name, opts = {}) {
  const id = await db.projects.add({ name, createdAt: Date.now(), ...opts })
  return { id, name, ...opts }
}
export async function getProjects() {
  return db.projects.orderBy('createdAt').reverse().toArray()
}
export async function updateProject(id, patch) {
  return db.projects.update(id, patch)
}
/** Deleting a project keeps its chats and documents; they return to "no project". */
export async function deleteProject(id) {
  await db.conversations.where('projectId').equals(id).modify({ projectId: null })
  await db.documents.where('projectId').equals(id).modify({ projectId: null })
  return db.projects.delete(id)
}
export async function assignConversation(conversationId, projectId) {
  return db.conversations.update(conversationId, { projectId: projectId ?? null })
}

// ─── Whole-database backup ───
// No backend means no sync: a cleared browser profile is total data loss.
export async function exportAll() {
  const [conversations, messages, documents, settings, projects, memories] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    db.documents.toArray(),
    db.settings.toArray(),
    db.projects.toArray(),
    db.memories ? db.memories.toArray().catch(() => []) : Promise.resolve([]),
  ])
  return {
    format: 'yogatik-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations, messages, documents, projects, memories,
    // API keys are deliberately excluded — a backup file is not an encrypted
    // store, and users share these without thinking.
    settings: settings.filter(r => !/^apikey_|^synced_|^user$/.test(r.key)),
  }
}

/** @param {'merge'|'replace'} mode */
export async function importAll(data, mode = 'merge') {
  if (data?.format !== 'yogatik-backup') throw new Error('Not a Yogatik backup file.')
  if (data.version > 1) throw new Error('This backup was made by a newer version of Yogatik.')

  return db.transaction('rw', db.conversations, db.messages, db.documents, db.settings, db.projects, db.memories, async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.documents.clear(),
        db.projects.clear(),
        db.memories ? db.memories.clear().catch(() => {}) : Promise.resolve(),
      ])
    }

    const projectMap = new Map()
    for (const pr of data.projects || []) {
      const { id, ...rest } = pr
      projectMap.set(id, await db.projects.add(rest))
    }

    // Conversation ids are auto-increment and will collide on merge, so remap.
    const idMap = new Map()
    for (const c of data.conversations || []) {
      const { id, projectId, ...rest } = c
      const newId = await db.conversations.add({ ...rest, projectId: projectMap.get(projectId) ?? null })
      idMap.set(id, newId)
    }
    for (const m of data.messages || []) {
      const { id, conversationId, ...rest } = m
      const mapped = idMap.get(conversationId)
      if (mapped == null) continue        // orphaned message
      await db.messages.add({ ...rest, conversationId: mapped })
    }
    for (const d of data.documents || []) {
      const { id, projectId, ...rest } = d
      await db.documents.add({ ...rest, projectId: projectMap.get(projectId) ?? null })
    }
    for (const row of data.settings || []) {
      if (/^apikey_|^synced_|^user$/.test(row.key)) continue   // never restore secrets
      await db.settings.put(row)
    }
    for (const mem of data.memories || []) {
      if (db.memories) {
        const { id, ...rest } = mem
        await db.memories.add(rest).catch(() => {})
      }
    }

    return {
      conversations: (data.conversations || []).length,
      messages: (data.messages || []).length,
      documents: (data.documents || []).length,
      memories: (data.memories || []).length,
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
