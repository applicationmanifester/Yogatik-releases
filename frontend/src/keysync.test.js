/**
 * Key vault: signing in is the whole mechanism. Same account, any device, keys
 * present — and never plaintext on the wire or at rest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptSecret, decryptSecret } from './crypto'

// One shared fake "Firestore document" that both fake devices talk to.
let cloud = {}
let currentUser = null

vi.mock('./firebaseAuth', () => ({
  signInWithGoogle: vi.fn(),
  checkRedirectResult: vi.fn(),
  logOutGoogle: vi.fn(),
  authRedirectPending: () => false,
  purgePlaintextKeys: vi.fn(async () => 0),
  saveUserApiKey: vi.fn(async (provider, apiKey, secret) => {
    if (!secret) return { synced: false, reason: 'no-secret' }
    if (!currentUser) return { synced: false, reason: 'signed-out' }
    cloud[provider] = await encryptSecret(apiKey, secret)
    return { synced: true }
  }),
  getUserApiKeys: vi.fn(async (...secrets) => {
    const candidates = secrets.flat().filter(Boolean)
    const out = {}
    for (const [provider, sealed] of Object.entries(cloud)) {
      for (const s of candidates) {
        const plain = await decryptSecret(sealed, s)
        if (plain) { out[provider] = plain; break }
      }
    }
    return out
  }),
}))

// In-memory settings store standing in for IndexedDB.
let settings = {}
vi.mock('./db', () => ({
  getSetting: vi.fn(async (k, fallback = null) => (settings[k] ?? fallback)),
  setSetting: vi.fn(async (k, v) => { settings[k] = v }),
  getAllSettings: vi.fn(async () => ({ ...settings })),
}))

const api = await import('./api')

const USER = { uid: 'uid-123', email: 'a@b.c' }

beforeEach(() => {
  cloud = {}
  settings = {}
  currentUser = null
})

/** Sign in on a device that starts with nothing stored locally. */
async function signIn() {
  currentUser = USER
  settings.user = USER
}

describe('account key sync', () => {
  it('uploads a saved key as soon as the user is signed in', async () => {
    await signIn()
    const res = await api.saveProviderApiKey('groq', 'gsk-secret')

    expect(res.synced).toBe(true)
    expect(Object.keys(cloud)).toEqual(['groq'])
    // Sealed, not stored in the clear.
    expect(cloud.groq).not.toContain('gsk-secret')
  })

  it('does not upload anything when signed out', async () => {
    const res = await api.saveProviderApiKey('groq', 'gsk-secret')
    expect(res.synced).toBe(false)
    expect(cloud).toEqual({})
    expect(settings.apikey_groq).toBe('gsk-secret')   // still usable locally
  })

  it('gives a second device the key with nothing but a sign-in', async () => {
    await signIn()
    await api.saveProviderApiKey('groq', 'gsk-secret')

    // Device two: same account, empty local storage, nothing typed.
    settings = { user: USER }
    const { pulled } = await api.pullCloudKeys()

    expect(pulled).toBe(1)
    expect(settings.apikey_groq).toBe('gsk-secret')
  })

  it('is on exactly when there is a session', async () => {
    expect(await api.isCloudSyncOn()).toBe(false)
    await signIn()
    expect(await api.isCloudSyncOn()).toBe(true)
  })

  it('round-trips both directions without duplicating work', async () => {
    await signIn()
    await api.saveProviderApiKey('groq', 'gsk-1')
    settings = { user: USER, apikey_openai: 'sk-2' }

    const { pulled, pushed } = await api.syncCloudKeys()
    expect(pulled).toBe(1)                    // groq came down
    expect(pushed).toBe(2)                    // both went up
    expect(Object.keys(cloud).sort()).toEqual(['groq', 'openai'])
  })
})

