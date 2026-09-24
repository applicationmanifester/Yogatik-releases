/**
 * Video Studio export utilities:
 * - Slice and export audio as WAV using Web Audio API
 * - Capture full-resolution still frame as PNG
 * - Record/render trimmed segment as MP4/WebM using MediaRecorder or WebCodecs
 */

export function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '00:00.00'
  const s = Math.max(0, Number(sec))
  const mins = Math.floor(s / 60)
  const secs = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

export function parseTimeToSeconds(str) {
  if (!str) return 0
  const parts = String(str).trim().split(':')
  if (parts.length === 1) return Math.max(0, parseFloat(parts[0]) || 0)
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0
    const s = parseFloat(parts[1]) || 0
    return Math.max(0, m * 60 + s)
  }
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0
    const m = parseFloat(parts[1]) || 0
    const s = parseFloat(parts[2]) || 0
    return Math.max(0, h * 3600 + m * 60 + s)
  }
  return 0
}

/**
 * Capture full-res snapshot frame from video element as Blob
 */
export async function captureVideoSnapshot(videoEl) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
    throw new Error('Video is not loaded or has invalid dimensions')
  }
  const canvas = document.createElement('canvas')
  canvas.width = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to generate snapshot blob'))
    }, 'image/png')
  })
}

/**
 * Extract audio between startSec and endSec as a 16-bit PCM WAV Blob
 */
export async function extractAudioClip(videoUrl, startSec, endSec) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) throw new Error('AudioContext not supported')
  const ctx = new AudioCtx()

  try {
    const res = await fetch(videoUrl)
    const arrayBuffer = await res.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    const sampleRate = audioBuffer.sampleRate
    const numChannels = audioBuffer.numberOfChannels
    const totalDuration = audioBuffer.duration

    const s = Math.max(0, Math.min(startSec, totalDuration))
    const e = Math.min(totalDuration, Math.max(s + 0.1, endSec))
    const startSample = Math.floor(s * sampleRate)
    const endSample = Math.floor(e * sampleRate)
    const sampleCount = Math.max(1, endSample - startSample)

    // Interleave channels to 16-bit PCM WAV
    const bytesPerSample = 2
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = sampleCount * blockAlign
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(view, 8, 'WAVE')

    // fmt sub-chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true)  // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, 16, true) // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data')
    view.setUint32(40, dataSize, true)

    // Write samples
    const channels = []
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c))
    }

    let offset = 44
    for (let i = 0; i < sampleCount; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][startSample + i] || 0))
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        view.setInt16(offset, intSample, true)
        offset += 2
      }
    }

    return new Blob([view], { type: 'audio/wav' })
  } finally {
    try { await ctx.close() } catch { /* ignore */ }
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Record trimmed video segment from video element using MediaRecorder
 */
export async function renderTrimmedClip({
  videoEl,
  startSec,
  endSec,
  playbackRate = 1.0,
  onProgress,
  signal,
}) {
  if (!videoEl) throw new Error('Video element required')
  const duration = Math.max(0.1, endSec - startSec)

  const stream = (typeof videoEl.captureStream === 'function')
    ? videoEl.captureStream()
    : (typeof videoEl.mozCaptureStream === 'function')
      ? videoEl.mozCaptureStream()
      : null

  if (!stream) {
    throw new Error('Your browser does not support video stream capture')
  }

  let mimeType = 'video/mp4;codecs=avc1'
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp9,opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }
  }

  const chunks = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
  })

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  // Position video to start
  videoEl.pause()
  videoEl.currentTime = startSec
  videoEl.playbackRate = playbackRate
  await new Promise(r => {
    const onSeek = () => { videoEl.removeEventListener('seeked', onSeek); r() }
    videoEl.addEventListener('seeked', onSeek)
  })

  return new Promise((resolve, reject) => {
    let checkInterval = null

    const cleanup = () => {
      if (checkInterval) clearInterval(checkInterval)
      videoEl.pause()
      videoEl.playbackRate = 1.0
    }

    recorder.onstop = () => {
      cleanup()
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: mimeType })
      resolve({ blob, ext, mimeType })
    }

    recorder.onerror = (e) => {
      cleanup()
      reject(e)
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup()
        if (recorder.state !== 'inactive') recorder.stop()
        reject(new Error('Export aborted'))
      })
    }

    recorder.start(100)
    videoEl.play().catch(reject)

    checkInterval = setInterval(() => {
      const cur = videoEl.currentTime
      const progress = Math.min(100, Math.round(((cur - startSec) / duration) * 100))
      onProgress?.(progress)

      if (cur >= endSec || videoEl.ended) {
        clearInterval(checkInterval)
        checkInterval = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
    }, 50)
  })
}
