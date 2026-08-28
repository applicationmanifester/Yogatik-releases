import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

const { db } = await import('./db')
const { exportFullWorkspaceArchive, importFullWorkspaceArchive } = await import('./workspaceArchive')

describe('workspaceArchive', () => {
  beforeEach(async () => {
    await db.conversations.clear()
    await db.messages.clear()
    await db.memories.clear()
  })

  it('imports valid workspace archives accurately', async () => {
    const sampleArchive = {
      yogatik_version: '3.20.0',
      exported_at: new Date().toISOString(),
      conversations: [
        { id: 1, title: 'Archived Conversation', createdAt: new Date().toISOString() }
      ],
      messages: [
        { id: 101, conversationId: 1, role: 'user', content: 'Hello world', createdAt: new Date().toISOString() }
      ],
      memories: [
        { id: 'mem-1', store: 'semantic', text: 'Prefers TypeScript', importance: 0.9, createdAt: Date.now() }
      ]
    }

    const res = await importFullWorkspaceArchive(sampleArchive)
    expect(res.success).toBe(true)
    expect(res.conversationsCount).toBe(1)
    expect(res.messagesCount).toBe(1)
    expect(res.memoriesCount).toBe(1)

    const storedConvs = await db.conversations.toArray()
    expect(storedConvs.length).toBe(1)
    expect(storedConvs[0].title).toBe('Archived Conversation')
  })
})
