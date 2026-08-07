/**
 * Schema migration and backup integrity.
 *
 * These guard the only irreversible failure mode in the app: there is no server
 * copy, so a bad upgrade or a lossy backup destroys the user's data outright.
 * Needs `fake-indexeddb` (devDependency) to run IndexedDB under Node.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'

/** Recreate a v2 database exactly as an existing user's browser holds it. */
async function seedV2() {
  await Dexie.delete('YogatikDB')
  const old = new Dexie('YogatikDB')
  old.version(1).stores({
    conversations: '++id, title, updatedAt',
    messages: '++id, conversationId, role, createdAt',
    settings: 'key',
  })
  old.version(2).stores({
    conversations: '++id, title, updatedAt',
    messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
    settings: 'key',
    documents: '++id, name, createdAt',
  })
  await old.open()
  const cid = await old.conversations.add({ title: 'Old chat', updatedAt: Date.now() })
  await old.messages.add({ conversationId: cid, role: 'user', content: 'hello from v2', createdAt: 1 })
  await old.messages.add({ conversationId: cid, role: 'assistant', content: 'reply from v2', createdAt: 2 })
  await old.documents.add({ name: 'handbook.pdf', chunks: ['a', 'b'], createdAt: Date.now() })
  await old.settings.put({ key: 'provider', value: 'groq' })
  await old.settings.put({ key: 'apikey_groq', value: 'gsk-secret-value' })
  old.close()
}

let db
beforeEach(async () => {
  await seedV2()
  db = await import('./db.js')      // opens with the current (v3) schema
})

describe('v2 → v3 migration', () => {
  it('keeps conversations, messages, documents and settings', async () => {
    const convs = await db.getConversations()
    expect(convs).toHaveLength(1)
    expect(convs[0].title).toBe('Old chat')

    const full = await db.getConversation(convs[0].id)
    expect(full.messages.map(m => m.content)).toEqual(['hello from v2', 'reply from v2'])

    expect(await db.getDocuments()).toHaveLength(1)
    expect(await db.getSetting('provider')).toBe('groq')
  })

  it('shows pre-project rows under "no project" rather than hiding them', async () => {
    expect(await db.getConversations(null)).toHaveLength(1)
    expect(await db.getDocuments(null)).toHaveLength(1)
  })
})

describe('projects', () => {
  it('scopes conversations to their project', async () => {
    const convs = await db.getConversations()
    const p = await db.createProject('Work')
    await db.assignConversation(convs[0].id, p.id)

    expect(await db.getConversations(p.id)).toHaveLength(1)
    expect(await db.getConversations(null)).toHaveLength(0)
  })

  it('keeps chats when a project is deleted', async () => {
    const convs = await db.getConversations()
    const p = await db.createProject('Temp')
    await db.assignConversation(convs[0].id, p.id)
    await db.deleteProject(p.id)

    expect(await db.getConversations(null)).toHaveLength(1)
  })
})

describe('backup', () => {
  it('never includes API keys', async () => {
    const backup = await db.exportAll()
    expect(JSON.stringify(backup)).not.toContain('gsk-secret-value')
  })

  it('round-trips without loss or duplication', async () => {
    const backup = await db.exportAll()
    expect(backup.messages).toHaveLength(2)

    const counts = await db.importAll(backup, 'replace')
    expect(counts.messages).toBe(2)

    const convs = await db.getConversations()
    expect(convs).toHaveLength(1)          // replace must not duplicate
    const full = await db.getConversation(convs[0].id)
    expect(full.messages.map(m => m.content)).toEqual(['hello from v2', 'reply from v2'])
  })

  it('merge adds a second copy instead of overwriting', async () => {
    const backup = await db.exportAll()
    await db.importAll(backup, 'merge')
    expect(await db.getConversations()).toHaveLength(2)
  })

  it('rejects a file that is not a Yogatik backup', async () => {
    await expect(db.importAll({ some: 'json' })).rejects.toThrow(/not a yogatik backup/i)
  })

  it('remaps conversation ids so restored messages stay attached', async () => {
    const backup = await db.exportAll()
    await db.importAll(backup, 'merge')
    for (const c of await db.getConversations()) {
      const full = await db.getConversation(c.id)
      expect(full.messages).toHaveLength(2)
    }
  })
})
