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
// prefsSync doc lives in its own namespace (users/{uid}/prefs/prefs_v1).
let prefsVault = null

vi.mock('./firebaseAuth', () => ({
  signInWithGoogle: vi.fn(), checkRedirectResult: vi.fn(), logOutGoogle: vi.fn(),
  saveUserApiKey: vi.fn(), getUserApiKeys: vi.fn(async () => ({})),
  purgePlaintextKeys: vi.fn(), authRedirectPending: () => false,
  saveVault: vi.fn(async (cipher, meta) => { vault = cipher; vaultMeta = meta; return { synced: true, chunks: 1 } }),
  loadVault: vi.fn(async () => vault),
  getVaultMeta: vi.fn(async () => vaultMeta),
  savePrefsSnapshot: vi.fn(async (cipher) => { prefsVault = cipher; return { synced: true } }),
  loadPrefsSnapshot: vi.fn(async () => prefsVault),
  getPrefsMeta: vi.fn(async () => null),
}))

import { db, setSetting, createConversation, addMessage, getConversations } from './db'
import { pushCloudData, pullCloudData, syncCloudData, vaultSecret } from './api'
import { decryptSecret } from './crypto'
import { mergeSnapshotsLWW, pickConversationWinner, pickDocumentWinner } from './syncMerge'

describe('encrypted cloud sync', () => {
  beforeEach(async () => {
    vault = null; vaultMeta = null; prefsVault = null
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

  it('LWW: a newer remote conversation wins, a stale one does not clobber', () => {
    const local = { id: 1, title: 'Notes', updatedAt: 100 }
    const newerRemote = { id: 9, title: 'Notes edited elsewhere', updatedAt: 500 }
    const staleRemote = { id: 9, title: 'Ancient edit', updatedAt: 50 }
    expect(pickConversationWinner(local, newerRemote)).toBe(newerRemote)
    expect(pickConversationWinner(local, staleRemote)).toBe(local)
    // Equal clocks keep local — never clobber on a tie.
    expect(pickConversationWinner(local, { ...local, id: 9 })).toBe(local)
  })

  it('LWW: document metadata converges on the newer copy by hash identity', () => {
    const localDoc = { id: 1, hash: 'abc', name: 'a.pdf', updatedAt: 100 }
    const newerDoc = { id: 5, hash: 'abc', name: 'a-renamed.pdf', updatedAt: 900 }
    expect(pickDocumentWinner(localDoc, newerDoc)).toBe(newerDoc)
    expect(pickDocumentWinner(newerDoc, localDoc)).toBe(newerDoc)
  })

  it('mergeSnapshotsLWW unions messages and keeps newer metadata', () => {
    const local = {
      conversations: [{ id: 1, syncId: 's1', title: 'Chat', updatedAt: 100 }],
      messages: [{ id: 11, conversationId: 1, role: 'user', content: 'hi' }],
      documents: [{ id: 1, hash: 'h1', name: 'doc.pdf', updatedAt: 100 }],
    }
    const remote = {
      conversations: [{ id: 7, syncId: 's1', title: 'Chat (renamed)', updatedAt: 500 }],
      messages: [
        { id: 11, conversationId: 7, role: 'user', content: 'hi' },
        { id: 12, conversationId: 7, role: 'assistant', content: 'hello' },
      ],
      documents: [{ id: 3, hash: 'h1', name: 'doc-renamed.pdf', updatedAt: 600 }],
    }
    const merged = mergeSnapshotsLWW(local, remote)
    expect(merged.conversations).toHaveLength(1)
    expect(merged.conversations[0].title).toBe('Chat (renamed)')
    expect(merged.messages.map(m => m.content).sort()).toEqual(['hello', 'hi'])
    expect(merged.documents).toHaveLength(1)
    expect(merged.documents[0].name).toBe('doc-renamed.pdf')
  })

  it('new rows mint a stable syncId for cross-device identity', async () => {
    const conv = await createConversation('Sync identity check')
    const row = await db.conversations.get(conv.id)
    expect(typeof row.syncId).toBe('string')
    expect(row.syncId.length).toBeGreaterThan(0)
  })

  it('syncCloudData carries prefs through the same opt-in gate', async () => {
    // Gate OFF: nothing happens at all — not even prefs push.
    await setSetting('chat_prefs', { temperature: 0.9 })
    const off = await syncCloudData()
    expect(off).toEqual({ synced: false, reason: 'disabled' })
    expect(prefsVault).toBeNull()

    // Gate ON: prefs pull (empty first pass) + push ride along with the
    // corpus sync; API keys stay out of the prefs snapshot.
    await setSetting('apikey_openai', 'sk-wired-not-in-prefs-123')
    await setSetting('chat_prefs', { cloud_sync: true, temperature: 0.9 })
    const res = await syncCloudData()
    expect(res.synced).toBe(true)
    expect(res.prefs).toMatchObject({ pulled: 0, pushed: true, fields: expect.any(Number) })
    expect(prefsVault.startsWith('v1.')).toBe(true)

    const snap = JSON.parse(await decryptSecret(prefsVault, await vaultSecret()))
    expect(snap.prefs.temperature).toBe(0.9)
    expect(prefsVault).not.toContain('sk-wired-not-in-prefs-123')
  })

  // NOTE (follow-up, not this change): true multi-writer convergence needs a
  // CRDT or per-message op log. LWW here covers conversation/document
  // metadata; concurrent edits to the SAME conversation on two offline devices
  // keep the newer copy's metadata with a message union — not a
  // collaborative-editing guarantee.
})
