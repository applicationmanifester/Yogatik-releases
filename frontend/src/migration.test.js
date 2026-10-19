/**
 * Schema migration and backup integrity.
 *
 * These guard the only irreversible failure mode in the app: there is no server
 * copy, so a bad upgrade or a lossy backup destroys the user's data outright.
 * Needs `fake-indexeddb` (devDependency) to run IndexedDB under Node.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

// The suite runs in ONE fork (see vitest.config.js), so Dexie may already be
// cached from a file that imported it without fake-indexeddb — and Dexie reads
// `indexedDB` once, at import. Injecting the dependency directly makes this
// file independent of which test ran first.
globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

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
  db = await import('./db.js')      // opens with the current (v9) schema
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

describe('artifact version store (v9)', () => {
  it('new table exists and is indexed by artifactKey after the upgrade', async () => {
    // `db` is the module namespace here; the Dexie instance is the default export
    expect(db.default.artifact_versions).toBeDefined()
    const id = await db.saveArtifactVersion({ artifactKey: 'old chat|html', title: 'Old chat', language: 'html', code: '<h1>a</h1>' })
    expect(id).not.toBeNull()
    const rows = await db.default.artifact_versions.where('artifactKey').equals('old chat|html').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].code).toBe('<h1>a</h1>')
    expect(rows[0].createdAt).toBeGreaterThan(0)
  })

  it('archives a regenerated body instead of overwriting it', async () => {
    const key = 'dashboard widget|html'
    const firstId = await db.saveArtifactVersion({ artifactKey: key, code: '<h1>a</h1>' })
    // identical re-save is a no-op: reopening an unchanged artifact must not
    // fill the strip with lookalike chips
    expect(await db.saveArtifactVersion({ artifactKey: key, code: '<h1>a</h1>' })).toBe(firstId)

    const secondId = await db.saveArtifactVersion({ artifactKey: key, code: '<h1>a</h1>\n<p>b</p>' })
    expect(secondId).not.toBe(firstId)

    const rows = await db.getArtifactVersions(key)
    expect(rows.map(r => r.code)).toEqual(['<h1>a</h1>', '<h1>a</h1>\n<p>b</p>'])
    // ±lines badge frozen at save time; the first body counts as created from nothing
    expect(rows[0]).toEqual(expect.objectContaining({ added: 1, removed: 0, lineCount: 1 }))
    expect(rows[1]).toEqual(expect.objectContaining({ added: 1, removed: 0, lineCount: 2 }))
  })

  it('keeps the newest 30 versions per artifact and evicts the oldest', async () => {
    const key = 'churn|js'
    for (let i = 0; i < 40; i++) {
      await db.saveArtifactVersion({ artifactKey: key, code: `line\n${'x'.repeat(i)}\nend` })
    }
    const all = await db.default.artifact_versions.where('artifactKey').equals(key).toArray()
    expect(all).toHaveLength(30)
    expect(all.every(r => r.code !== 'line\n\nend')).toBe(true)   // the oldest was evicted
    expect(all[all.length - 1].code.includes('x'.repeat(39))).toBe(true)   // the newest (i = 39) survived
  })

  it('pin persists per conversation and resets when unpinned', async () => {
    await db.setArtifactPinned(42, true, 'app|html')
    expect(await db.getArtifactPinned(42, 'app|html')).toBe(true)
    expect(await db.getSetting('artifact_pinned_42', false)).toBe(true)
    await db.setArtifactPinned(42, false, 'app|html')
    expect(await db.getArtifactPinned(42, 'app|html')).toBe(false)
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

// [live-recording] v10 adds the live_recordings store (call recap + ≤12 camera
// thumbnails). Same guarantees the other stores get: the upgrade is clean over
// a seeded v2 database, the cap evicts the OLDEST, and the rows never leak into
// the whole-database backup.
describe('live recordings store (v10)', () => {
  it('table exists, is indexed by startedAt, and round-trips after the upgrade', async () => {
    expect(db.default.live_recordings).toBeDefined()
    const id = await db.saveLiveRecording({
      conversationId: null, startedAt: 1000, endedAt: 61_000, durationSec: 60,
      provider: 'gemini', model: 'gemini-2.5-flash',
      turns: [{ at: 0, speaker: 'user', text: 'hello' }],
      toolEvents: [{ at: 500, name: 'web_search', kind: 'call' }],
      sources: [], artefacts: ['web_search'], frames: [{ at: 0, thumb: 'data:image/jpeg;base64,QUJD' }],
      sizeBytes: 2048,
    })
    expect(id).not.toBeNull()
    const row = await db.default.live_recordings.get(id)
    expect(row.turns[0].text).toBe('hello')
    expect(row.frames[0].thumb.startsWith('data:image/jpeg')).toBe(true)

    const list = await db.getLiveRecordings()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)

    // scoped view: a recording without a conversation shows under "no conversation"
    expect(await db.getLiveRecordings(20, 42)).toHaveLength(0)
    expect(await db.getLiveRecordings(20, undefined)).toHaveLength(1)

    expect((await db.getLiveRecording(id)).durationSec).toBe(60)
    await db.deleteLiveRecording(id)
    expect(await db.getLiveRecording(id)).toBeUndefined()
    expect(await db.getLiveRecordings()).toHaveLength(0)
  })

  it('keeps the newest 20 recordings and evicts the oldest, without ever growing', async () => {
    for (let i = 0; i < 24; i++) {
      await db.saveLiveRecording({ startedAt: 1_000_000 + i * 1000, endedAt: 0, durationSec: i, turns: [{ at: 0, speaker: 'user', text: `call ${i}` }], toolEvents: [] })
    }
    const all = await db.getLiveRecordings()
    expect(all).toHaveLength(20)
    expect(all[0].durationSec).toBe(23)        // newest first
    expect(all[19].durationSec).toBe(4)        // 0..3 evicted
    expect(all.some(r => r.durationSec === 0)).toBe(false)
  })

  it('never enters the whole-database backup — the row stays on this machine', async () => {
    await db.saveLiveRecording({ startedAt: 0, endedAt: 1, durationSec: 1, turns: [{ at: 0, speaker: 'user', text: 'private' }], toolEvents: [], frames: [{ at: 0, thumb: 'data:image/jpeg;base64,QUJD' }] })
    const backup = await db.exportAll()
    expect(JSON.stringify(backup)).not.toContain('live_recording')
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
