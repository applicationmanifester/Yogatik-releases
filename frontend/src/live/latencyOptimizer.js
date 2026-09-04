/**
 * Yogatik Latency & Instant-Response Optimization Engine
 *
 * Implements 3 core real-time latency reduction innovations:
 * 1. Zero-RTT Connection Pre-warming (DNS prefetch + TLS 1.3 keep-alive preconnect)
 * 2. Speculative Early-Endpoint Streaming (SEES) - pre-triggers model streaming on interim speech
 * 3. Perceptual Luminance Hash (pHash) Edge Vision Throttling - eliminates redundant frame overhead
 */

const PREWARMED_ORIGINS = new Set()

/**
 * Pre-warms DNS resolution and TLS handshake for an AI provider origin.
 * Call this as soon as Live mode is mounted or chat input is focused.
 * @param {string} [baseUrl] - Provider endpoint base URL
 */
export function preconnectProvider(baseUrl = '') {
  if (typeof document === 'undefined' || !baseUrl) return
  try {
    const url = new URL(baseUrl)
    const origin = url.origin
    if (PREWARMED_ORIGINS.has(origin)) return
    PREWARMED_ORIGINS.add(origin)

    // Injects preconnect link tag
    const preconnect = document.createElement('link')
    preconnect.rel = 'preconnect'
    preconnect.href = origin
    preconnect.crossOrigin = 'anonymous'
    document.head.appendChild(preconnect)

    // Injects dns-prefetch fallback
    const dnsPrefetch = document.createElement('link')
    dnsPrefetch.rel = 'dns-prefetch'
    dnsPrefetch.href = origin
    document.head.appendChild(dnsPrefetch)

    // Dispatches keep-alive probe if fetch is available
    if (typeof fetch === 'function') {
      fetch(`${origin}/favicon.ico`, { mode: 'no-cors', keepalive: true, cache: 'no-store' }).catch(() => {})
    }
  } catch {
    // Non-fatal if invalid URL
  }
}

/**
 * Evaluates whether an interim speech transcript looks syntactically ready for speculative execution.
 * @param {string} text - Interim speech transcript
 * @returns {boolean}
 */
export function isSyntacticallyComplete(text = '') {
  const t = String(text || '').trim()
  if (!t) return false
  const words = t.split(/\s+/)
  if (words.length < 4) return false

  // If it ends with explicit punctuation
  if (/[.!?]$/.test(t)) return true

  // Common conversational question starters with sufficient word length
  const QUESTION_STARTERS = /^(?:what|who|when|where|why|how|can\s+you|could\s+you|tell\s+me|explain|is\s+it|are\s+there|show\s+me)\b/i
  if (words.length >= 5 && QUESTION_STARTERS.test(t)) return true

  // If 7 or more words without a trailing connector
  const TRAILING_CONNECTOR = /\b(?:and|or|but|because|if|that|which|where|when|with|to|then|like)\s*$/i
  if (words.length >= 7 && !TRAILING_CONNECTOR.test(t)) return true

  return false
}

/**
 * Coordinates speculative background LLM requests while the user is still in interim speech.
 */
export class SpeculativeEndpointManager {
  constructor({ onSpeculate, onCancel } = {}) {
    this.onSpeculate = onSpeculate
    this.onCancel = onCancel
    this.speculativeText = ''
    this.speculativeTask = null
    this.isSpeculating = false
    this.speculativeController = null
  }

  /**
   * Called on each interim speech update.
   * @param {string} interimText
   */
  handleInterim(interimText = '') {
    const text = String(interimText || '').trim()
    if (!text) return

    if (this.isSpeculating) {
      // If user continues speaking with new words that deviate from speculative text
      const normCur = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      const normSpec = this.speculativeText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      if (!normCur.startsWith(normSpec) && !normSpec.startsWith(normCur)) {
        this.cancel()
      }
      return
    }

    if (isSyntacticallyComplete(text)) {
      this.isSpeculating = true
      this.speculativeText = text
      this.speculativeController = typeof AbortController !== 'undefined' ? new AbortController() : null
      this.speculativeTask = this.onSpeculate?.(text, this.speculativeController?.signal)
    }
  }

  /**
   * Commits the final turn. Returns the active speculative stream if matched, or null.
   * @param {string} finalText
   * @returns {{ matched: boolean, task: any, controller: AbortController|null }}
   */
  commit(finalText = '') {
    if (!this.isSpeculating) return { matched: false, task: null, controller: null }

    const normFinal = String(finalText || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const normSpec = this.speculativeText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

    const matched = normFinal === normSpec || normFinal.startsWith(normSpec) || normSpec.startsWith(normFinal)
    const task = this.speculativeTask
    const controller = this.speculativeController

    this.speculativeText = ''
    this.speculativeTask = null
    this.isSpeculating = false
    this.speculativeController = null

    if (!matched) {
      controller?.abort()
      this.onCancel?.()
      return { matched: false, task: null, controller: null }
    }

    return { matched: true, task, controller }
  }

  cancel() {
    if (!this.isSpeculating) return
    this.speculativeController?.abort()
    this.speculativeText = ''
    this.speculativeTask = null
    this.isSpeculating = false
    this.speculativeController = null
    this.onCancel?.()
  }
}

/**
 * Computes a fast 8x8 perceptual luminance hash of a video/screen canvas
 * and compares it to a previous hash to detect if scene changed.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [prevHash]
 * @returns {{ hash: string, deltaPercent: number, isChanged: boolean }}
 */
export function pHashDelta(canvas, prevHash = '') {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { hash: '', deltaPercent: 100, isChanged: true }
  }

  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { hash: '', deltaPercent: 100, isChanged: true }

    // Downsample to 8x8
    const W = 8, H = 8
    const tempCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    if (!tempCanvas) return { hash: '', deltaPercent: 100, isChanged: true }
    tempCanvas.width = W
    tempCanvas.height = H
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })
    tempCtx.drawImage(canvas, 0, 0, W, H)

    const imgData = tempCtx.getImageData(0, 0, W, H).data
    let totalLuminance = 0
    const lums = new Float32Array(64)

    for (let i = 0; i < 64; i++) {
      const idx = i * 4
      // Rec. 601 luma formula
      const luma = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]
      lums[i] = luma
      totalLuminance += luma
    }

    const avg = totalLuminance / 64
    let hashBits = ''
    for (let i = 0; i < 64; i++) {
      hashBits += lums[i] >= avg ? '1' : '0'
    }

    if (!prevHash || prevHash.length !== 64) {
      return { hash: hashBits, deltaPercent: 100, isChanged: true }
    }

    // Hamming distance
    let diff = 0
    for (let i = 0; i < 64; i++) {
      if (hashBits[i] !== prevHash[i]) diff++
    }

    const deltaPercent = Math.round((diff / 64) * 100)
    // Less than 8% diff considered unchanged scene
    return { hash: hashBits, deltaPercent, isChanged: deltaPercent >= 8 }
  } catch {
    return { hash: '', deltaPercent: 100, isChanged: true }
  }
}
