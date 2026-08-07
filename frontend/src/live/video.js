/**
 * Camera capture for the Live session.
 *
 * The API accepts <=1 JPEG/sec. We stay under that and additionally skip
 * frames that look identical to the last one — a still room burns ~260 tokens
 * a second for no information.
 */

const MAX_EDGE = 768        // MEDIA_RESOLUTION_MEDIUM gets nothing from more
const HASH_EDGE = 16        // 16x16 grayscale average hash

export async function createCamera({ facingMode = 'user' } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const hashCanvas = document.createElement('canvas')
  hashCanvas.width = hashCanvas.height = HASH_EDGE
  const hashCtx = hashCanvas.getContext('2d', { willReadFrequently: true })

  let lastHash = null

  const hash = () => {
    hashCtx.drawImage(video, 0, 0, HASH_EDGE, HASH_EDGE)
    const { data } = hashCtx.getImageData(0, 0, HASH_EDGE, HASH_EDGE)
    const gray = new Uint8Array(HASH_EDGE * HASH_EDGE)
    let sum = 0
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
      sum += gray[p]
    }
    const mean = sum / gray.length
    const bits = new Uint8Array(gray.length)
    for (let i = 0; i < gray.length; i++) bits[i] = gray[i] > mean ? 1 : 0
    return bits
  }

  const distance = (a, b) => {
    let d = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
    return d
  }

  return {
    stream,
    video,
    /**
     * @param {boolean} force send even if the scene is unchanged
     * @returns {string|null} base64 JPEG, or null when nothing changed
     */
    grab(force = false) {
      if (!video.videoWidth) return null
      const h = hash()
      // ~6% of pixels flipped. Below that it is sensor noise, not motion.
      const changed = !lastHash || distance(lastHash, h) > 16
      if (!changed && !force) return null
      lastHash = h

      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    },
    close() {
      stream.getTracks().forEach(t => t.stop())
      video.srcObject = null
    },
  }
}
