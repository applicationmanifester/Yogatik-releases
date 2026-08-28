/**
 * One capture layer for the companion, on every surface.
 *
 * There were two before, and they disagreed. useCompanionBrain fell back to
 * getDisplayMedia when the desktop bridge was missing, so the in-page panel
 * could watch a shared screen in a browser. CompanionView asked for
 * `window.__YOGATIK_COMPANION__.captureScreen` directly and, finding nothing,
 * told the user "Screen capture is desktop-only" — in the popped-out window
 * that is the companion's flagship surface. Same product, two answers to
 * "can you see my screen", and only one of them was true.
 *
 * So: capability detection and frame grabbing live HERE, and both surfaces ask
 * this module. The pure half (pickScreenMode, describeCapabilities) is exported
 * separately so it can be tested without a browser.
 */

export const SOURCE = { SCREEN: 'screen', CAMERA: 'camera' }

/* ────────────────────────────── capability ─────────────────────────────── */

/**
 * Which screen path is available, as a value rather than a boolean:
 *   'native'        — the desktop bridge grabs the real screen with no prompt
 *   'display-media' — the browser can, after the user picks a surface
 *   null            — neither
 *
 * PURE: takes the two things it depends on, so the decision is testable.
 */
export function pickScreenMode({ bridge = null, displayMedia = false } = {}) {
  if (bridge && typeof bridge.captureScreen === 'function') return 'native'
  if (displayMedia) return 'display-media'
  return null
}

export function captureCapabilities(win = typeof window !== 'undefined' ? window : null) {
  const nav = win?.navigator
  return {
    screen: pickScreenMode({
      bridge: win?.__YOGATIK_COMPANION__,
      displayMedia: typeof nav?.mediaDevices?.getDisplayMedia === 'function',
    }),
    camera: typeof nav?.mediaDevices?.getUserMedia === 'function',
  }
}

/** One line of honest UI text for what the companion can currently see. */
export function describeCapabilities(caps, { watching = false, camera = false } = {}) {
  if (watching && camera) return 'Watching your screen and camera'
  if (watching) return caps.screen === 'native' ? 'Watching your screen' : 'Watching the window you shared'
  if (camera) return 'Watching your camera'
  if (!caps.screen && !caps.camera) return 'No screen or camera available here'
  return 'Not watching'
}

/* ─────────────────────────────── controller ────────────────────────────── */

const JPEG_QUALITY = 0.72
const MAX_EDGE = 1280

function drawToDataUrl(source, w, h) {
  // Downscaled before it ever reaches a model. A raw 4K screenshot is megabytes
  // of base64 and ~1.1k tokens either way, so the full resolution buys nothing
  // and costs the whole frame budget.
  const scale = Math.min(1, MAX_EDGE / Math.max(w || 1, h || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((w || MAX_EDGE) * scale))
  canvas.height = Math.max(1, Math.round((h || MAX_EDGE) * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * Holds at most one screen stream and one camera stream, and hands out frames.
 *
 * The `ended` callback is not decoration. A browser screen share has a "Stop
 * sharing" bar OUTSIDE the page, and when the user presses it the track ends
 * with no error anywhere — the watch toggle stays lit and simply never sees
 * anything again. That silent-dead-switch failure is precisely what the whole
 * liveWatch module exists to prevent, so the end of a track has to become an
 * event the UI acts on.
 */
export function createCaptureController({ onEnded } = {}) {
  const streams = { screen: null, camera: null }
  const videos = { screen: null, camera: null }

  const bridge = () => (typeof window !== 'undefined' ? window.__YOGATIK_COMPANION__ : null)
  const caps = () => captureCapabilities()

  function teardown(source) {
    try { streams[source]?.getTracks().forEach(t => t.stop()) } catch { /* already gone */ }
    streams[source] = null
    if (videos[source]) {
      try { videos[source].srcObject = null } catch { /* detached */ }
      videos[source] = null
    }
  }

  async function attach(source, stream) {
    streams[source] = stream
    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    videos[source] = video
    await video.play().catch(() => { /* some browsers resolve without play() */ })
    // Wait for real dimensions; drawing a 0x0 video yields a blank frame that
    // the model then confidently describes as an empty screen.
    if (!video.videoWidth) {
      await new Promise((resolve) => {
        const done = () => resolve()
        video.addEventListener('loadedmetadata', done, { once: true })
        setTimeout(done, 1200)
      })
    }
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        if (streams[source] !== stream) return   // already replaced
        teardown(source)
        onEnded?.(source)
      })
    }
    return video
  }

  return {
    capabilities: caps,

    isActive(source) {
      if (source === SOURCE.SCREEN && caps().screen === 'native') return true
      return !!streams[source]?.active
    },

    /**
     * Begin a source. Must be called from a user gesture on the web —
     * getDisplayMedia and getUserMedia both refuse otherwise, and a toggle that
     * flips on and then quietly never captures is the failure this prevents.
     */
    async start(source) {
      if (source === SOURCE.SCREEN) {
        if (caps().screen === 'native') return { ok: true, mode: 'native' }
        if (!caps().screen) return { ok: false, error: 'This browser cannot capture a screen.' }
        if (streams.screen?.active) return { ok: true, mode: 'display-media' }
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 2 },   // a companion glances; it does not record
            audio: false,
          })
          await attach('screen', stream)
          return { ok: true, mode: 'display-media' }
        } catch (e) {
          return { ok: false, error: e?.name === 'NotAllowedError' ? 'Screen sharing was declined.' : (e?.message || String(e)) }
        }
      }

      if (source === SOURCE.CAMERA) {
        if (!caps().camera) return { ok: false, error: 'No camera is available here.' }
        if (streams.camera?.active) return { ok: true }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, facingMode: 'user' },
            audio: false,
          })
          await attach('camera', stream)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e?.name === 'NotAllowedError' ? 'Camera access was declined.' : (e?.message || String(e)) }
        }
      }

      return { ok: false, error: `Unknown capture source: ${source}` }
    },

    stop(source) { teardown(source) },
    stopAll() { teardown('screen'); teardown('camera') },

    /** One frame as a JPEG data URL, or null. Never throws — a failed grab is a skipped look. */
    async grab(source = SOURCE.SCREEN) {
      try {
        if (source === SOURCE.SCREEN && caps().screen === 'native') {
          const res = await bridge().captureScreen()
          return res?.success ? (res.dataUrl || null) : null
        }
        const video = videos[source]
        if (!video || !streams[source]?.active) return null
        return drawToDataUrl(video, video.videoWidth, video.videoHeight)
      } catch {
        return null
      }
    },
  }
}
