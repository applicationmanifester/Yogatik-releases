import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

// In-memory Firestore vault + a signed-in user, so pushCloudData/pullCloudData
// exercise the real encrypt → chunk → decrypt → importAll path with no network.
let vault = null
let vaultMeta = null

vi.mock('./firebaseAuth', () => ({
  signInWithGoogle: vi.fn(), checkRedirectResult: vi.fn(), logOutGoogle: vi.fn(),
  saveUserApiKey: vi.fn(), getUserApiKeys: vi.fn(async () => ({})),
  purgePlaintextKeys: vi.fn(), authRedirectPending: () => false,
  saveVault: vi.fn(async (cipher, meta) => { vault = cipher; vaultMeta = meta; return { synced: true, chunks: 1 } }),
  loadVault: vi.fn(async () => vault),
  getVaultMeta: vi.fn(async () => vaultMeta),
}))

import { db, setSetting, createConversation, addMessage, getConversations } from './db'
import { pushCloudData, pullCloudData } from './api'

describe('encrypted cloud sync', () => {
  beforeEach(async () => {
    vault = null; vaultMeta = null
    await Promise.all([db.conversations.clear(), db.messages.clear(), db.documents.clear(), db.projects.clear(), db.settings.clear()])
    await setSetting('user', { uid: 'user-123', email: 'a@b.c' })
  })

  it('push encrypts a snapshot; pull decrypts and restores it', async () => {
    const conv = await createConversation('Hello world')
    await addMessage(conv.id, 'user', 'hi')
    await addMessage(conv.id, 'assistant', 'hello!')

    const res = await pushCloudData()
    expect(res.synced).toBe(true)
    expect(typeof vault).toBe('string')
    expect(vault.startsWith('v1.')).toBe(true)      // AES-GCM envelope, not plaintext
    expect(vault).not.toContain('Hello world')       // ciphertext hides content

    // Wipe the device, then pull it back.
    await Promise.all([db.conversations.clear(), db.messages.clear()])
    expect((await getConversations()).length).toBe(0)

    const pull = await pullCloudData('merge')
    expect(pull.conversations).toBeGreaterThanOrEqual(1)
    const convs = await getConversations()
    expect(convs.some(c => c.title === 'Hello world')).toBe(true)
  })

  it('a wrong account secret cannot decrypt (no leak, no crash)', async () => {
    await createConversation('Secret chat')
    await pushCloudData()
    await setSetting('user', { uid: 'someone-else' })   // different secret
    const pull = await pullCloudData('merge')
    expect(pull.reason).toBe('decrypt-failed')
  })
})
