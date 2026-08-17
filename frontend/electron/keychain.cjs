// OS-encrypted key vault. Uses Electron safeStorage (Windows DPAPI / macOS
// Keychain / libsecret on Linux) to encrypt provider API keys at rest so they
// never sit in plaintext IndexedDB on the desktop.
//
// The renderer calls window.__YOGATIK_KEYCHAIN__.{available,encrypt,decrypt}.
// db.js transparently wraps `apikey_*` settings through these before writing to
// / after reading from IndexedDB. Encrypted values carry a `kc.v1:` prefix so
// legacy plaintext keys (and cloud-synced keys) keep working untouched, and if
// encryption is unavailable (e.g. headless Linux) it degrades to plaintext —
// exactly today's behaviour. No user can be locked out of a key they already had.

const { ipcMain, safeStorage } = require('electron')

const PREFIX = 'kc.v1:'

function isAvailable() {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

function registerKeychain() {
  ipcMain.handle('keychain:available', () => isAvailable())

  // plaintext -> "kc.v1:<base64>" (or the original plaintext if unavailable).
  ipcMain.handle('keychain:encrypt', (_e, plain) => {
    if (typeof plain !== 'string' || plain === '') return plain
    if (!isAvailable()) return plain
    try {
      const buf = safeStorage.encryptString(plain)
      return PREFIX + buf.toString('base64')
    } catch {
      return plain // never throw: caller falls back to plaintext at rest
    }
  })

  // "kc.v1:<base64>" -> plaintext. A non-prefixed value is returned as-is
  // (legacy plaintext / cloud-synced). A prefixed value that fails to decrypt
  // (different OS user / corrupt) returns null so the app treats the key as
  // missing and prompts for re-entry rather than handing back garbage.
  ipcMain.handle('keychain:decrypt', (_e, value) => {
    if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
    if (!isAvailable()) return null
    try {
      const buf = Buffer.from(value.slice(PREFIX.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      return null
    }
  })
}

module.exports = { registerKeychain, KEYCHAIN_PREFIX: PREFIX }
