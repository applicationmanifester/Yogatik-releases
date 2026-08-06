// Web Crypto API — built into all browsers
export const hashTool = {
  schema: {
    description: 'Generate hash, encode/decode, or create UUID',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Input text' },
      algorithm: { type: 'string', enum: ['md5', 'sha256', 'sha512', 'base64_encode', 'base64_decode', 'uuid'], description: 'Hash algorithm or operation' },
    }, required: ['algorithm'] },
  },
  async execute({ text = '', algorithm }) {
    if (algorithm === 'uuid') return { success: true, tool: 'hash', result: crypto.randomUUID(), algorithm }
    if (algorithm === 'base64_encode') return { success: true, tool: 'hash', result: btoa(text), algorithm }
    if (algorithm === 'base64_decode') {
      try { return { success: true, tool: 'hash', result: atob(text), algorithm } }
      catch { return { success: false, error: 'Invalid base64' } }
    }
    const algoMap = { md5: null, sha256: 'SHA-256', sha512: 'SHA-512' }
    const alg = algoMap[algorithm]
    if (!alg) return { success: false, error: 'MD5 not available in Web Crypto; use sha256' }
    const enc = new TextEncoder().encode(text)
    const hash = await crypto.subtle.digest(alg, enc)
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
    return { success: true, tool: 'hash', result: hex, algorithm }
  }
}
