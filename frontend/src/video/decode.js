/**
 * Reading frames back OUT of an existing video.
 *
 * Approach: an off-screen <video> element, seeked frame by frame and drawn to a
 * canvas. Not WebCodecs' VideoDecoder, deliberately — that needs an MP4 demuxer
 * (mp4box.js or similar) as a new dependency, and this path works in every
 * engine including the Electron webview with nothing added. encodeVideo already
 * takes a drawFrame(i) callback and a canvas, so the edited frames flow straight
 * back into the existing encoder.
 *
 * HONEST LIMITS, stated because they change what you can promise:
 *  - Seeking is only as accurate as the container's keyframes. For heavily
 *    compressed sources a requested time can land a frame or two away.
 *  - This path carries NO AUDIO. The source's audio track is not decoded, so an
 *    edited clip is silent unless narration is added separately. Anything that
 *    edits video must say so rather than quietly dropping the sound.
 *  - It runs in real seek time, not WebCodecs speed: a long source is slow.
 */

/** Load a video element and wait until its metadata (duration/size) is known. */
export function openVideo(src, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Video editing needs a browser environment.'))
      return
    }
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out loading the video.'))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      video.onloadedmetadata = null
      video.onerror = null
    }

    video.onloadedmetadata = () => {
      cleanup()
      if (!video.duration || !Number.isFinite(video.duration)) {
        reject(new Error('Could not read the video duration — the file may be corrupt or an unsupported codec.'))
        return
      }
      resolve({
        video,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('Could not decode this video. Supported here: what the browser itself can play (MP4/H.264, WebM).'))
    }
    video.src = src
  })
}

/**
 * Seek and wait for the frame to be ready.
 * Resolving on `seeked` alone is not enough in every engine — the painted frame
 * can still be the previous one — so requestVideoFrameCallback is used when
 * available and a rAF tick is the fallback.
 */
export function seekTo(video, timeSec, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(timeSec, video.duration || 0))
    let done = false

    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      resolve(video.currentTime)
    }
    const timer = setTimeout(() => {
      if (done) return
      done = true
      video.removeEventListener('seeked', onSeeked)
      reject(new Error(`Timed out seeking to ${target.toFixed(3)}s.`))
    }, timeoutMs)

    function onSeeked() {
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => finish())
      } else if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => finish())
      } else {
        finish()
      }
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    // Nudge past an exact-equality no-op: assigning the current time fires no
    // seeked event at all, and the promise would hang forever.
    if (Math.abs((video.currentTime || 0) - target) < 1e-6) onSeeked()
    else video.currentTime = target
  })
}

/**
 * Build a drawFrame(i) for encodeVideo that paints source frames according to a
 * timeline mapper: index -> source time in seconds (or null to leave the canvas
 * blank, e.g. a gap).
 */
export function makeFrameSampler({ video, ctx, width, height, mapFrameToTime }) {
  return async function drawFrame(i) {
    const t = mapFrameToTime(i)
    if (t == null) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      return
    }
    await seekTo(video, t)
    ctx.drawImage(video, 0, 0, width, height)
  }
}

/** Frame index -> source time for a trim, honouring a speed factor. */
export function trimMapper({ startSec, fps, speed = 1 }) {
  return (i) => startSec + (i / fps) * speed
}

/**
 * Frame index -> {sourceIndex, time} for a concatenation.
 * Returns null past the end so the sampler paints black rather than throwing.
 */
export function concatMapper(segments, fps) {
  return (i) => {
    for (const seg of segments) {
      if (i >= seg.startFrame && i < seg.startFrame + seg.totalFrames) {
        return { source: seg.source, time: seg.sourceStartSec + (i - seg.startFrame) / fps }
      }
    }
    return null
  }
}
