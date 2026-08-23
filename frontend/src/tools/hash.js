// Web Crypto API — built into all browsers
export const hashTool = {
  schema: {
    description: 'Generate hash, encode/decode, or create UUID',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Input text' },
      algorithm: { type: 'string', enum: ['sha256', 'sha512', 'sha1', 'base64_encode', 'base64_decode', 'uuid'], description: 'Hash algorithm or operation' },
    }, required: ['algorithm'] },
  },
  async execute({ text = '', algorithm }) {
    if (algorithm === 'uuid') return { success: true, tool: 'hash', result: crypto.randomUUID(), algorithm }
    // btoa/atob are Latin-1 only: "héllo 🌍" throws. Go through UTF-8 bytes.
    if (algorithm === 'base64_encode') {
      const bytes = new TextEncoder().encode(text)
      const bin = Array.from(bytes, b => String.fromCharCode(b)).join('')
      return { success: true, tool: 'hash', result: btoa(bin), algorithm }
    }
    if (algorithm === 'base64_decode') {
      try {
        const bin = atob(text.trim())
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
        return { success: true, tool: 'hash', result: new TextDecoder().decode(bytes), algorithm }
      } catch { return { success: false, error: 'Invalid base64' } }
    }
    const algoMap = { sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' }
    const alg = algoMap[algorithm]
    if (!alg) return { success: false, error: `Unsupported algorithm: ${algorithm}. Use sha256, sha512, sha1, base64_encode, base64_decode or uuid.` }
    const enc = new TextEncoder().encode(text)
    const hash = await crypto.subtle.digest(alg, enc)
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
    return { success: true, tool: 'hash', result: hex, algorithm, input_length: text.length }
  }
}
