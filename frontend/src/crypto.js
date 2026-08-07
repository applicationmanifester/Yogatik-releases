/**
 * Client-side envelope encryption for provider API keys (AES-GCM 256 + PBKDF2).
 * Plaintext keys never leave the browser: only ciphertext is written to Firestore,
 * and the passphrase that derives the key is never stored or transmitted.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()
const PBKDF2_ITERS = 310_000 // OWASP 2023 guidance for SHA-256

const b64 = {
  to: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  from: (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
}

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** @returns {Promise<string>} self-describing envelope: v1.salt.iv.ciphertext */
export async function encryptSecret(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return `v1.${b64.to(salt)}.${b64.to(iv)}.${b64.to(ct)}`
}

/** @returns {Promise<string|null>} null when the passphrase is wrong or data is corrupt */
export async function decryptSecret(envelope, passphrase) {
  try {
    const [v, salt, iv, ct] = String(envelope).split('.')
    if (v !== 'v1') return null
    const key = await deriveKey(passphrase, b64.from(salt))
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(iv) }, key, b64.from(ct))
    return dec.decode(pt)
  } catch {
    return null // AES-GCM auth tag mismatch === wrong passphrase
  }
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('v1.') && value.split('.').length === 4
}
