import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

import { db } from './db'
import {
  saveMemory,
  recallMemories,
  forgetMemory,
  clearProjectMemories,
  rankMemories,
  memoryRelevance,
} from './memory'

describe('memory ranking (pure)', () => {
  it('scores token overlap, case-insensitive', () => {
    expect(memoryRelevance('likes dark roast coffee', 'COFFEE preference')).toBeGreaterThan(0)
    expect(memoryRelevance('unrelated line', 'coffee preference')).toBe(0)
    expect(memoryRelevance('anything', '')).toBe(0)
  })

  it('ranks best-first and caps at the limit', () => {
    const items = [
      { text: 'unrelated weather note', at: 3 },
      { text: 'coffee dark roast', at: 1 },
      { text: 'coffee shop downtown', at: 2 },
    ]
    const ranked = rankMemories(items, 'coffee', 2)
    expect(ranked).toHaveLength(2)
    expect(ranked[0].text).toMatch(/coffee/)
  })
})

describe('project-scoped memory (Dexie)', () => {
  beforeEach(async () => {
    await db.memories.clear().catch(() => {})
  })

  it('saves and recalls within the same project', async () => {
    await saveMemory({ text: 'prefers dark roast coffee', projectId: 7 })
    const hits = await recallMemories('coffee', { projectId: 7 })
    expect(hits.some((m) => m.text.includes('dark roast'))).toBe(true)
  })

  it('never leaks memories across projects', async () => {
    await saveMemory({ text: 'work deadline friday', projectId: 1 })
    await saveMemory({ text: 'personal anniversary june', projectId: 2 })
    const work = await recallMemories('deadline friday', { projectId: 1 })
    expect(work.every((m) => m.projectId === 1)).toBe(true)
    const personal = await recallMemories('anniversary june', { projectId: 2 })
    expect(personal.every((m) => m.projectId === 2)).toBe(true)
  })

  it('rejects empty text', async () => {
    expect(await saveMemory({ text: '   ', projectId: 1 })).toBeNull()
  })

  it('forgets by id and clears a whole project', async () => {
    const rec = await saveMemory({ text: 'temporary note alpha', projectId: 9 })
    await forgetMemory(rec.id)
    expect(await recallMemories('temporary alpha', { projectId: 9 })).toHaveLength(0)

    await saveMemory({ text: 'keepable note beta', projectId: 9 })
    await saveMemory({ text: 'other project gamma', projectId: 10 })
    expect(await clearProjectMemories(9)).toBeGreaterThanOrEqual(1)
    expect(await recallMemories('beta', { projectId: 9 })).toHaveLength(0)
    expect((await recallMemories('gamma', { projectId: 10 })).length).toBeGreaterThanOrEqual(1)
  })
})
