/**
 * Client-side encryption utilities for E2E encrypted sync.
 * Uses Web Crypto API (SubtleCrypto) for AES-GCM encryption.
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const SALT_LENGTH = 16
const ITERATIONS = 100000

/**
 * Generate a random crypto key pair for key exchange.
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  )

  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey),
  }
}

/**
 * Derive an AES key from a private key using PBKDF2.
 */
export async function deriveKey(privateKeyBase64) {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  )

  // Generate a salt for key derivation
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  
  const baseKey = await crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
      public: await crypto.subtle.importKey(
        'spki',
        base64ToArrayBuffer(privateKeyBase64), // Using same key for demo; in production, use peer's public key
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      ),
    },
    privateKey,
    { name: 'PBKDF2', hash: 'SHA-256' },
    false,
    ['deriveKey']
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )

  return await crypto.subtle.exportKey('raw', derivedKey)
}

/**
 * Encrypt data with AES-GCM.
 */
export async function encryptData(plaintext, keyBase64) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(keyBase64),
      { name: ALGORITHM },
      false,
      ['encrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const encoded = new TextEncoder().encode(plaintext)

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoded
    )

    // Combine IV + ciphertext for storage
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), IV_LENGTH)

    return arrayBufferToBase64(combined.buffer)
  } catch (error) {
    console.error('Encryption failed:', error)
    return null
  }
}

/**
 * Decrypt data with AES-GCM.
 */
export async function decryptData(ciphertextBase64, keyBase64) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToArrayBuffer(keyBase64),
      { name: ALGORITHM },
      false,
      ['decrypt']
    )

    const combined = base64ToArrayBuffer(ciphertextBase64)
    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Decryption failed:', error)
    return null
  }
}

/**
 * Generate a random encryption key for direct use.
 */
export async function generateEncryptionKey() {
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
  return await crypto.subtle.exportKey('raw', key)
}

// Helper functions
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export default {
  generateKeyPair,
  deriveKey,
  encryptData,
  decryptData,
  generateEncryptionKey,
}
