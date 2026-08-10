import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

globalThis.indexedDB ??= new IDBFactory()
globalThis.IDBKeyRange ??= IDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

const { db } = await import('./db')
const { searchChats, invalidateChatIndex, excerpt } = await import('./chatSearch')

beforeAll(async () => {
  await db.open()
})

beforeEach(async () => {
  await db.messages.clear()
  await db.conversations.clear()
  invalidateChatIndex()
})

async function seed() {
  const a = await db.conversations.add({ title: 'Roof repair quotes', createdAt: 1 })
  const b = await db.conversations.add({ title: 'Holiday planning', createdAt: 2 })
  await db.messages.bulkAdd([
    { conversationId: a, role: 'user', content: 'What does replacing slate roof tiles cost?', createdAt: 10 },
    { conversationId: a, role: 'assistant', content: 'Slate tiles run about £80 per square metre installed.', createdAt: 11 },
    { conversationId: b, role: 'user', content: 'Cheap flights to Lisbon in October', createdAt: 12 },
    { conversationId: b, role: 'assistant', content: 'October is shoulder season, so fares drop.', createdAt: 13 },
  ])
  return { a, b }
}

describe('searchChats', () => {
  it('finds a conversation by words that only appear in its messages', async () => {
    const { a } = await seed()
    const hits = await searchChats('slate tiles')
    expect(hits[0].conversationId).toBe(a)
    expect(hits[0].title).toBe('Roof repair quotes')
  })

  it('returns one hit per conversation, not one per message', async () => {
    const { a } = await seed()
    const hits = await searchChats('slate')
    expect(hits.filter(h => h.conversationId === a)).toHaveLength(1)
  })

  it('ranks the relevant conversation above the unrelated one', async () => {
    const { b } = await seed()
    const hits = await searchChats('Lisbon flights')
    expect(hits[0].conversationId).toBe(b)
  })

  it('ignores queries too short to mean anything', async () => {
    await seed()
    expect(await searchChats('a')).toEqual([])
    expect(await searchChats('  ')).toEqual([])
  })

  it('says nothing rather than guessing when there is no match', async () => {
    await seed()
    expect(await searchChats('submarine actuator')).toEqual([])
  })

  it('reflects a message added after the last search', async () => {
    const { b } = await seed()
    expect(await searchChats('kayak')).toEqual([])
    await db.messages.add({ conversationId: b, role: 'user', content: 'Can we rent a kayak there?', createdAt: 14 })
    invalidateChatIndex()
    const hits = await searchChats('kayak')
    expect(hits[0]?.conversationId).toBe(b)
  })

  it('searches the text of a multimodal turn without choking on the parts', async () => {
    const c = await db.conversations.add({ title: 'Photo', createdAt: 3 })
    await db.messages.add({
      conversationId: c,
      role: 'user',
      content: [{ type: 'text', text: 'Is this a hairline crack in the render?' }, { type: 'image_url', image_url: { url: 'data:…' } }],
      createdAt: 20,
    })
    invalidateChatIndex()
    const hits = await searchChats('hairline crack')
    expect(hits[0]?.conversationId).toBe(c)
  })
})

describe('excerpt', () => {
  it('centres on the match instead of always taking the opening words', () => {
    const text = `${'filler '.repeat(40)}the pump seal failed${' more '.repeat(40)}`
    expect(excerpt(text, 'pump seal')).toContain('pump seal')
  })

  it('falls back to the start when nothing matches', () => {
    expect(excerpt('short text here', 'zzz')).toBe('short text here')
  })
})
