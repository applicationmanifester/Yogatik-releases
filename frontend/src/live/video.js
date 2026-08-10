/**
 * Camera / screen capture for Live and the `see` tool.
 *
 * One implementation, two entry points. Frames are JPEG, <=1/sec, and frames
 * that look identical to the last one are skipped — a still room burns ~260
 * tokens a second for no information.
 *
 * grab() takes a capture profile: scene questions stay small and cheap, text
 * questions capture big and sharp (768px @ q0.7 cannot read a serial number).
 */

const MAX_EDGE = 768        // MEDIA_RESOLUTION_MEDIUM gets nothing from more
const HASH_EDGE = 16        // 16x16 grayscale average hash
const HASH_THRESHOLD = 16   // ~6% of bits flipped; below that it is sensor noise

function makeHasher() {
  const c = document.createElement('canvas')
  c.width = c.height = HASH_EDGE
  const ctx = c.getContext('2d', { willReadFrequently: true })
  return (video) => {
    ctx.drawImage(video, 0, 0, HASH_EDGE, HASH_EDGE)
    const { data } = ctx.getImageData(0, 0, HASH_EDGE, HASH_EDGE)
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
}

const distance = (a, b) => {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

async function attach(stream) {
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const hash = makeHasher()

  let lastHash = null
  let stopped = false
  let prevFrame = null      // the frame before the most recent one
  let lastFrame = null

  stream.getVideoTracks()[0]?.addEventListener('ended', () => { stopped = true })

  return {
    stream,
    video,
    get stopped() { return stopped },

    /**
     * @param {boolean} force capture even if the scene has not changed
     * @param {{maxEdge?:number, quality?:number, crop?:number}} profile
     *        crop = centre fraction to keep (0.6 zooms into the middle 60%)
     * @returns {string|null} base64 JPEG, or null when nothing changed
     */
    grab(force = false, profile = {}) {
      if (!video.videoWidth || stopped) return null
      const h = hash(video)
      const changed = !lastHash || distance(lastHash, h) > HASH_THRESHOLD
      if (!changed && !force) return null
      lastHash = h

      const { maxEdge = MAX_EDGE, quality = 0.7, crop = 0 } = profile
      const vw = video.videoWidth
      const vh = video.videoHeight
      const sw = crop > 0 && crop < 1 ? Math.round(vw * crop) : vw
      const sh = crop > 0 && crop < 1 ? Math.round(vh * crop) : vh
      const sx = (vw - sw) / 2
      const sy = (vh - sh) / 2

      const scale = Math.min(1, maxEdge / Math.max(sw, sh))
      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      prevFrame = lastFrame
      lastFrame = b64
      return b64
    },

    /** The frame captured before the current one — "what changed" needs two. */
    previousFrame() { return prevFrame },

    close() {
      stopped = true
      stream.getTracks().forEach(t => t.stop())
      video.srcObject = null
    },
  }
}

export async function createCamera({ facingMode = 'user' } = {}) {
  return attach(await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  }))
}

export async function createScreenCapture() {
  return attach(await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { max: 5 } },
    audio: false,
  }))
}
