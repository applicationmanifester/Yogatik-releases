/**
 * Renderer-side wrapper for the desktop OS key vault (Electron safeStorage).
 * db.js pipes `apikey_*` settings through these two helpers so provider keys are
 * encrypted at rest by Windows DPAPI / macOS Keychain instead of sitting in
 * plaintext IndexedDB.
 *
 * Everything degrades safely: in the browser build (or tests) there is no
 * __YOGATIK_KEYCHAIN__ bridge, so both helpers pass the value through unchanged —
 * exactly today's behaviour. Encrypted values carry the `kc.v1:` prefix, so
 * legacy plaintext keys and cloud-synced keys keep working untouched.
 */

const PREFIX = 'kc.v1:'

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_KEYCHAIN__) || null
}

/** True only inside the desktop app with an available OS crypto backend. */
export async function keychainAvailable() {
  const kc = bridge()
  if (!kc) return false
  try { return await kc.available() } catch { return false }
}

/** Encrypt a plaintext key for storage. Returns the value unchanged off-desktop. */
export async function sealKey(plaintext) {
  if (typeof plaintext !== 'string' || plaintext === '') return plaintext
  if (plaintext.startsWith(PREFIX)) return plaintext // already sealed
  const kc = bridge()
  if (!kc) return plaintext
  try {
    const sealed = await kc.encrypt(plaintext)
    return typeof sealed === 'string' ? sealed : plaintext
  } catch {
    return plaintext
  }
}

/**
 * Decrypt a stored value. A non-sealed value (legacy plaintext / cloud key) is
 * returned as-is. A sealed value that cannot be decrypted (different OS user /
 * corrupt) returns null so the app treats the key as missing and re-prompts,
 * rather than handing back ciphertext.
 */
export async function openKey(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
  const kc = bridge()
  if (!kc) return null // sealed value but no vault to open it
  try {
    return await kc.decrypt(value)
  } catch {
    return null
  }
}

export function isSealed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export const KEYCHAIN_PREFIX = PREFIX
