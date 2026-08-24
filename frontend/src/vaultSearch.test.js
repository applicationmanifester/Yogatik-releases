/**
 * local_vault_search searched nothing at all, and said so as though it were a
 * fact about the user's data.
 *
 * Two independent dead reads, either of which alone would have halved it:
 *
 *   doc.text   — uploads are stored as `chunks` and deliberately WITHOUT the
 *                full text (api.js: keeping both doubled IndexedDB usage), so
 *                `if (doc.text)` was never true and no document contributed.
 *   c.messages — read off a conversation ROW, where that field has never
 *                existed; messages live in their own table and getConversation()
 *                joins them in separately.
 *
 * With both dead the corpus was always empty, so the tool returned
 * "No local documents or chat history stored in IndexedDB." — telling the user
 * their vault was empty while it was full. It never threw, so nothing noticed.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import Dexie from 'dexie'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

const { addDocument, createConversation, addMessage } = await import('./db')
const { searchLocalVault } = await import('./retrieval')

beforeAll(async () => {
  // Stored exactly the way api.js stores a real upload.
  await addDocument({
    name: 'handbook.txt',
    type: 'text',
    chars: 120,
    chunks: [
      'The refund window is thirty days from the original purchase date.',
      'Escalate anything above five thousand dollars to the finance team.',
    ],
  })
  const conv = await createConversation('Budget talk', null, 'groq', 'model-x')
  await addMessage(conv.id, 'user', 'What is our policy on refunds for enterprise customers this quarter?')
  await addMessage(conv.id, 'assistant', 'Any refund above five thousand dollars needs finance approval first.')
})

describe('searchLocalVault', () => {
  it('finds text stored in a document’s chunks', async () => {
    const res = await searchLocalVault('refund window', 5)
    expect(res.success).toBe(true)
    expect(res.matches.length).toBeGreaterThan(0)
    expect(res.matches.some(m => m.source.startsWith('File:'))).toBe(true)
  })

  it('finds text stored in chat messages', async () => {
    const res = await searchLocalVault('enterprise customers', 5)
    expect(res.matches.some(m => m.source.startsWith('Chat:'))).toBe(true)
  })

  it('labels a chat hit with its conversation title', async () => {
    // The titles come from a join the old code never performed.
    const res = await searchLocalVault('enterprise customers', 5)
    const chat = res.matches.find(m => m.source.startsWith('Chat:'))
    expect(chat.source).toContain('Budget talk')
  })

  it('counts a corpus that is genuinely not empty', async () => {
    const res = await searchLocalVault('finance', 5)
    // 2 document chunks + 2 messages. Before the fix this was 0 and the tool
    // reported the vault as empty.
    expect(res.total_corpus_chunks).toBe(4)
  })

  it('still reports honestly when there really is nothing to search', async () => {
    const res = await searchLocalVault('zzzznotpresentanywhere', 5)
    expect(res.matches.length).toBe(0)
  })
})
