/**
 * Temporal Frame Buffer — Multi-frame rolling memory for live camera & video.
 * Inspired by GetStream Vision-Agents VideoLatestNQueue.
 *
 * Rather than analyzing a single frozen moment, this maintains a rolling FIFO
 * ring-buffer of timestamped frames (e.g. 1 frame per second).
 *
 * When a user asks an action or motion question ("Did my swing look right?",
 * "What was that that just passed?", "Watch me do this"), this provides
 * a chronological sequence of keyframes to multimodal VLMs (Gemini, GPT-4o, Claude).
 */

export class TemporalVideoBuffer {
  /**
   * @param {object} options
   * @param {number} [options.maxFrames=6] maximum frames to retain
   * @param {number} [options.maxEdge=640] maximum width or height in px (token optimized)
   * @param {number} [options.quality=0.75] JPEG compression quality
   */
  constructor(options = {}) {
    this.maxFrames = options.maxFrames || 6
    this.maxEdge = options.maxEdge || 640
    this.quality = options.quality ?? 0.75
    this.frames = [] // [{ timestamp: number, base64: string, dataUrl: string, width: number, height: number }]
    this.canvas = null
    this.ctx = null
  }

  /**
   * Ensure dimensions are even numbers (inspired by Vision-Agents ensure_even_dimensions)
   * and within maxEdge bounds to avoid token bloat and encoding artifacts.
   */
  calcDimensions(origWidth, origHeight, maxEdge = this.maxEdge) {
    if (!origWidth || !origHeight) return { width: 320, height: 240 }
    const scale = Math.min(1, maxEdge / Math.max(origWidth, origHeight))
    let w = Math.round(origWidth * scale)
    let h = Math.round(origHeight * scale)
    // Clamp to even integers
    if (w % 2 !== 0) w -= 1
    if (h % 2 !== 0) h -= 1
    return { width: Math.max(2, w), height: Math.max(2, h) }
  }

  /**
   * Capture a new frame from a video or canvas element.
   * @param {HTMLVideoElement|HTMLCanvasElement} sourceEl
   * @param {object} [overrideOptions]
   * @returns {object|null} the captured frame metadata
   */
  pushFrame(sourceEl, overrideOptions = {}) {
    if (!sourceEl) return null
    const origW = sourceEl.videoWidth || sourceEl.width || 0
    const origH = sourceEl.videoHeight || sourceEl.height || 0
    if (!origW || !origH) return null

    const maxEdge = overrideOptions.maxEdge || this.maxEdge
    const quality = overrideOptions.quality ?? this.quality
    const { width, height } = this.calcDimensions(origW, origH, maxEdge)

    if (typeof document !== 'undefined') {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas')
      }
      this.canvas.width = width
      this.canvas.height = height
      if (!this.ctx) {
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
      }
      if (this.ctx) {
        this.ctx.drawImage(sourceEl, 0, 0, width, height)
        const dataUrl = this.canvas.toDataURL('image/jpeg', quality)
        const base64 = dataUrl.split(',')[1] || ''
        const frame = {
          timestamp: Date.now(),
          base64,
          dataUrl,
          width,
          height,
        }
        this.frames.push(frame)
        if (this.frames.length > this.maxFrames) {
          this.frames.shift()
        }
        return frame
      }
    }
    return null
  }

  /** Total frames currently in buffer */
  get count() {
    return this.frames.length
  }

  hasFrames() {
    return this.frames.length > 0
  }

  getLatestFrame() {
    return this.frames[this.frames.length - 1] || null
  }

  /**
   * Get `count` chronologically spaced keyframes across the buffer.
   * @param {number} [count=3]
   * @returns {Array<object>}
   */
  getKeyframes(count = 3) {
    const len = this.frames.length
    if (len === 0) return []
    if (len <= count) {
      const now = Date.now()
      return this.frames.map((f, idx) => ({
        ...f,
        label: idx === len - 1 ? 'Now (current)' : `${Math.max(1, Math.round((now - f.timestamp) / 1000))}s ago`,
        index: idx,
      }))
    }

    // Pick evenly spaced indices: [0, middle, last]
    const indices = []
    const step = (len - 1) / (count - 1)
    for (let i = 0; i < count; i++) {
      indices.push(Math.round(i * step))
    }
    const uniqueIndices = Array.from(new Set(indices))
    const now = Date.now()

    return uniqueIndices.map((idx, sequenceIdx) => {
      const f = this.frames[idx]
      const isLatest = idx === len - 1
      const deltaSec = Math.max(0, Math.round((now - f.timestamp) / 1000))
      return {
        ...f,
        label: isLatest ? 'Now (current moment)' : `${deltaSec}s ago`,
        index: sequenceIdx,
      }
    })
  }

  /**
   * Build OpenAI/Gemini/Claude multi-image message parts for temporal questions.
   * @param {string} userQuestion
   * @param {number} [count=3]
   * @returns {Array<object>} array of { type: 'text'|'image_url', ... }
   */
  buildMultimodalPrompt(userQuestion = '', count = 3) {
    const keyframes = this.getKeyframes(count)
    if (keyframes.length === 0) {
      return [{ type: 'text', text: userQuestion }]
    }

    const parts = [
      {
        type: 'text',
        text: `${userQuestion.trim()}\n\n[Visual Context: Chronological camera frames spanning the last few seconds]:`,
      },
    ]

    for (let i = 0; i < keyframes.length; i++) {
      const f = keyframes[i]
      parts.push({
        type: 'text',
        text: `[Frame ${i + 1} of ${keyframes.length} — ${f.label}]`,
      })
      parts.push({
        type: 'image_url',
        image_url: { url: f.dataUrl },
      })
    }

    return parts
  }

  /** Clear all buffered frames */
  clear() {
    this.frames = []
  }
}

export const temporalVideoBuffer = new TemporalVideoBuffer()
