/**
 * The regression harness for reader/writer field drift.
 *
 * Three separate bugs in this codebase have had exactly one shape: a consumer
 * reading a property that the writer never puts on the row.
 *
 *   f.isDir          vs is_dir        — directories came back as matching files
 *   startLine/endLine vs offset/limit — ranged reads silently did nothing
 *   doc.text          vs doc.chunks   — local_vault_search found nothing, ever
 *   c.messages        vs db.messages  — and reported the vault as empty
 *
 * None of them threw. `undefined` reads as "absent", not as "broken", so the
 * feature degrades into an honest-looking empty answer and every test stays
 * green. Inspection has now caught these one at a time; this catches the class.
 *
 * The rule it enforces: every field a consumer depends on must survive a real
 * round trip through the real helpers and a real IndexedDB.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import Dexie from 'dexie'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

const db = await import('./db')
const { remember, allMemories } = await import('./memory4')

/**
 * Field -> who breaks if it goes missing. Naming the consumer is the point:
 * a bare list of keys invites someone to "clean up" one that looks unused.
 */
const CONTRACTS = {
  document: {
    chunks: 'retrieval.searchLocalVault + doc_search — the ONLY place document text lives',
    name: 'result sources, doc_list',
    chars: 'doc_list size reporting',
  },
  message: {
    conversationId: 'getMessages compound index, chatSearch grouping',
    role: 'agent history reconstruction',
    content: 'everything',
    createdAt: 'ordering — the [conversationId+createdAt] index depends on it',
  },
  conversation: {
    title: 'sidebar, chatSearch result labels, vault search sources',
    provider: 'which model answers when the chat is reopened',
    model: 'ditto',
  },
  memory: {
    store: 'memory4.selectForPrompt per-store caps',
    text: 'the memory itself',
    importance: 'salience ranking',
    refCount: 'salience ranking',
    at: 'recencyWeight — NOT createdAt, which is what a reader would guess',
  },
  media: {
    blob: 'the bytes; a video card recovers from media_id after reload',
    mime: 'playback',
    filename: 'download name',
  },
}

let convId
let docId
let mediaId

beforeAll(async () => {
  const doc = await db.addDocument({
    name: 'contract.txt', type: 'text', size: 42, chars: 42,
    chunks: ['first passage', 'second passage'],
  })
  docId = doc.id

  const conv = await db.createConversation('Contract chat', null, 'groq', 'model-x')
  convId = conv.id
  await db.addMessage(convId, 'user', 'hello there', null, null)

  await remember({ store: 'semantic', text: 'the user prefers metric units', importance: 0.8 })

  mediaId = await db.saveMedia({
    blob: new Blob(['bytes']), mime: 'video/mp4', filename: 'out.mp4', meta: { w: 2 },
  })
})

/** Assert every contracted field survives, naming the consumer when it does not. */
function assertContract(row, contract, label) {
  expect(row, `${label} row missing entirely`).toBeTruthy()
  for (const [field, consumer] of Object.entries(contract)) {
    expect(
      row[field],
      `${label}.${field} is missing after a real round trip — breaks: ${consumer}`,
    ).not.toBeUndefined()
  }
}

describe('persisted row contracts', () => {
  it('a document keeps the fields retrieval depends on', async () => {
    const [doc] = await db.getDocuments()
    assertContract(doc, CONTRACTS.document, 'document')
    // The specific drift that broke the vault: chunks is where the text is,
    // and `text` is deliberately NOT stored.
    expect(Array.isArray(doc.chunks)).toBe(true)
    expect(doc.chunks.length).toBe(2)
  })

  it('a message keeps the fields the agent and search depend on', async () => {
    const msgs = await db.getMessages(convId)
    assertContract(msgs[0], CONTRACTS.message, 'message')
  })

  it('a conversation row does NOT carry messages — they are joined', async () => {
    // This is the assumption whose violation emptied the vault search. Pinning
    // it as an explicit expectation means the next reader is told, not guessed.
    const [conv] = await db.getConversations()
    assertContract(conv, CONTRACTS.conversation, 'conversation')
    expect(conv.messages).toBeUndefined()

    const joined = await db.getConversation(convId)
    expect(Array.isArray(joined.messages)).toBe(true)
    expect(joined.messages.length).toBe(1)
  })

  it('a memory keeps `at`, not `createdAt`', async () => {
    const [mem] = await allMemories('semantic')
    assertContract(mem, CONTRACTS.memory, 'memory')
    // recencyWeight reads `at`. A consumer reaching for createdAt would get
    // undefined and silently score every memory as maximally stale.
    expect(mem.at).toEqual(expect.any(Number))
  })

  it('media keeps its bytes and how to play them', async () => {
    const row = await db.getMedia(mediaId)
    assertContract(row, CONTRACTS.media, 'media')
  })

  it('getMedia accepts a string id, because tool results carry strings', async () => {
    // media_id round-trips through JSON in a tool result, so it arrives back as
    // a string; db.media.get(string) would miss a numeric key.
    expect(await db.getMedia(String(mediaId))).toBeTruthy()
  })
})
