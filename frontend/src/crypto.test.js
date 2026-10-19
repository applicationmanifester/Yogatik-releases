import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, isEncrypted, KEY_STORAGE_DISCLOSURE } from './crypto'

const KEY = 'nvapi-abc123def456ghi789'
const PASS = 'correct horse battery staple'

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    expect(await decryptSecret(sealed, PASS)).toBe(KEY)
  })

  it('never leaks the plaintext into the envelope', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    expect(sealed).not.toContain(KEY)
    expect(sealed).not.toContain('nvapi')
  })

  it('produces a different ciphertext every time (random salt + iv)', async () => {
    const a = await encryptSecret(KEY, PASS)
    const b = await encryptSecret(KEY, PASS)
    expect(a).not.toBe(b)
    // ...but both still decrypt
    expect(await decryptSecret(a, PASS)).toBe(KEY)
    expect(await decryptSecret(b, PASS)).toBe(KEY)
  })

  it('returns null for the wrong passphrase rather than garbage', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    expect(await decryptSecret(sealed, 'wrong passphrase')).toBeNull()
  })

  it('rejects tampered ciphertext (AES-GCM auth tag)', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    const [v, salt, iv, ct] = sealed.split('.')
    const flipped = ct.startsWith('A') ? 'B' + ct.slice(1) : 'A' + ct.slice(1)
    expect(await decryptSecret([v, salt, iv, flipped].join('.'), PASS)).toBeNull()
  })

  it('rejects a tampered salt or iv', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    const [v, salt, iv, ct] = sealed.split('.')
    const badSalt = salt.startsWith('A') ? 'B' + salt.slice(1) : 'A' + salt.slice(1)
    expect(await decryptSecret([v, badSalt, iv, ct].join('.'), PASS)).toBeNull()
  })

  it('returns null on malformed input instead of throwing', async () => {
    expect(await decryptSecret('', PASS)).toBeNull()
    expect(await decryptSecret('not-an-envelope', PASS)).toBeNull()
    expect(await decryptSecret('v9.a.b.c', PASS)).toBeNull()
    expect(await decryptSecret(undefined, PASS)).toBeNull()
  })

  it('handles unicode and long secrets', async () => {
    const weird = '🔐 clé-très-longue ' + 'x'.repeat(2000)
    const sealed = await encryptSecret(weird, PASS)
    expect(await decryptSecret(sealed, PASS)).toBe(weird)
  })

  it('treats passphrases as case- and whitespace-sensitive', async () => {
    const sealed = await encryptSecret(KEY, PASS)
    expect(await decryptSecret(sealed, PASS.toUpperCase())).toBeNull()
    expect(await decryptSecret(sealed, PASS + ' ')).toBeNull()
  })
})

describe('isEncrypted', () => {
  it('recognises the envelope format', async () => {
    expect(isEncrypted(await encryptSecret(KEY, PASS))).toBe(true)
  })

  it('rejects plaintext keys — this is what stops a legacy key being uploaded as-is', () => {
    expect(isEncrypted(KEY)).toBe(false)
    expect(isEncrypted('sk-proj-1234')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted('v1.only.three')).toBe(false)
  })
})

describe('shipped key model — account-derived AES-GCM via Firebase Auth', () => {
  it('round-trips through the account secret api.js derives (yogatik.account.v1.<uid>)', async () => {
    const uid = 'test-uid-123'
    const accountSecret = `yogatik.account.v1.${uid}`
    const sealed = await encryptSecret(KEY, accountSecret)
    expect(isEncrypted(sealed)).toBe(true)
    expect(sealed).not.toContain(KEY)
    expect(await decryptSecret(sealed, accountSecret)).toBe(KEY)
    // Scoped to the account: another uid cannot open it.
    expect(await decryptSecret(sealed, `yogatik.account.v1.other-uid`)).toBeNull()
  })

  it('discloses the honest threat model next to key entry (not zero-knowledge)', async () => {
    // Rendered verbatim by ProviderModal.jsx + ProvidersTab.jsx via
    // KEY_STORAGE_DISCLOSURE — this pins the shipped wording.
    expect(KEY_STORAGE_DISCLOSURE).toContain('encrypted at rest')
    expect(KEY_STORAGE_DISCLOSURE).toContain('scoped to your account')
    expect(KEY_STORAGE_DISCLOSURE.toLowerCase()).toContain('not zero-knowledge')
  })
})
