/**
 * Client-side envelope encryption for provider API keys (AES-GCM 256 + PBKDF2).
 * Plaintext keys never leave the browser: only ciphertext is written to Firestore.
 *
 * THREAT MODEL (be precise — see DISCLOSURE below): the `secret` passed in is the
 * account-derived string `yogatik.account.v1.<uid>` (see api.js accountSecret),
 * NOT a user-chosen passphrase. So this is "encryption at rest, scoped to the
 * owner's uid" — it protects the key from casual Firestore inspection and scopes
 * it by the Firestore security rules, but it is NOT zero-knowledge: anyone able
 * to derive the uid could derive the secret. Surfacing this honestly (DISCLOSURE)
 * matters more than the crypto strength. If true zero-knowledge is ever wanted,
 * pass a real user passphrase here instead and drop the frictionless auto-sync.
 */

/** One-line, user-facing honesty string for the key-entry UI. */
export const KEY_STORAGE_DISCLOSURE =
  'Keys are encrypted at rest and scoped to your account — this is not zero-knowledge encryption.'

const enc = new TextEncoder()
const dec = new TextDecoder()
const PBKDF2_ITERS = 310_000 // OWASP 2023 guidance for SHA-256

const b64 = {
  to: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  from: (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
}

async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** @returns {Promise<string>} self-describing envelope: v1.salt.iv.ciphertext */
export async function encryptSecret(plaintext, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(secret, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return `v1.${b64.to(salt)}.${b64.to(iv)}.${b64.to(ct)}`
}

/** @returns {Promise<string|null>} null when the secret is wrong or data is corrupt */
export async function decryptSecret(envelope, secret) {
  try {
    const [v, salt, iv, ct] = String(envelope).split('.')
    if (v !== 'v1') return null
    const key = await deriveKey(secret, b64.from(salt))
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(iv) }, key, b64.from(ct))
    return dec.decode(pt)
  } catch {
    return null // AES-GCM auth tag mismatch === wrong secret
  }
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('v1.') && value.split('.').length === 4
}
