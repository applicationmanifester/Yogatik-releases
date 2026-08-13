/**
 * Frame encoder.
 *
 * Primary path: WebCodecs `VideoEncoder` + mp4-muxer. This encodes *offline* —
 * frame timestamps are computed, not sampled from the wall clock — so a 60s
 * video renders in a few seconds and never drops a frame.
 *
 * Fallback: MediaRecorder on a captured canvas stream. It records in real time
 * (a 60s video takes 60s) and produces WebM, so it is only used where WebCodecs
 * is missing.
 *
 * The muxer is pulled from esm.run for the same reason WebLLM is: it keeps a
 * dependency out of the bundle for the users who never render a video.
 */

const MUXER_CDN = 'https://esm.run/mp4-muxer@5.2.2'

// Ordered by quality; the first one the hardware admits to supporting wins.
const H264_CANDIDATES = ['avc1.640028', 'avc1.4D0028', 'avc1.42E01F', 'avc1.42001F']

// AAC first: Opus-in-MP4 is legal but several players still refuse it.
const AUDIO_CANDIDATES = [
  { codec: 'mp4a.40.2', muxer: 'aac', bitrate: 96000 },
  { codec: 'opus', muxer: 'opus', bitrate: 64000 },
]

/**
 * Yield to the event loop WITHOUT setTimeout.
 *
 * Background tabs clamp timers to ~1/second. The encoder loop yields once per
 * frame while the queue drains, so a 150-frame render that would take five
 * seconds in the foreground took over four minutes if the user switched tabs
 * while it worked. MessageChannel is a macrotask that Chrome does not throttle.
 */
const yieldToLoop = () => new Promise((resolve) => {
  const ch = new MessageChannel()
  ch.port1.onmessage = () => { ch.port1.close(); resolve() }
  ch.port2.postMessage(0)
})

export function webCodecsAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/** Bits-per-pixel tuned so slide text and Ken-Burns images stay crisp. Raised
 *  from 0.09 → 0.13 (and cap 12M → 16M): the old rate softened fine text. */
export function bitrateFor(width, height, fps) {
  const bpp = 0.13
  return Math.round(Math.min(16e6, Math.max(2e6, width * height * fps * bpp)))
}

async function pickAudioCodec(sampleRate) {
  if (typeof AudioEncoder === 'undefined') return null
  for (const cand of AUDIO_CANDIDATES) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({
        codec: cand.codec, sampleRate, numberOfChannels: 1, bitrate: cand.bitrate,
      })
      if (supported) return cand
    } catch { /* try the next one */ }
  }
  return null
}

/**
 * Encode mono PCM to chunks, held in memory (~2MB for the 180s cap).
 *
 * Buffering rather than muxing directly is deliberate: the muxer must be told
 * up front whether the file has an audio track, and a declared-but-empty track
 * produces a broken MP4. Encoding first means a narration failure degrades to
 * a silent video instead of a corrupt one.
 */
async function encodeAudioChunks({ pcm, sampleRate, codec }) {
  const CHUNK = 1024
  const out = []
  let error = null
  const encoder = new AudioEncoder({
    output: (chunk, meta) => out.push({ chunk, meta }),
    error: (e) => { error = e },
  })
  encoder.configure({
    codec: codec.codec, sampleRate, numberOfChannels: 1, bitrate: codec.bitrate,
  })

  try {
    for (let i = 0; i < pcm.length; i += CHUNK) {
      if (error) throw error
      const slice = pcm.subarray(i, Math.min(i + CHUNK, pcm.length))
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: slice.length,
        numberOfChannels: 1,
        timestamp: Math.round((i / sampleRate) * 1e6),
        data: slice.slice(),           // AudioData needs its own buffer
      })
      encoder.encode(data)
      data.close()
      while (encoder.encodeQueueSize > 16) await yieldToLoop()
    }
    await encoder.flush()
    if (error) throw error
    return out
  } finally {
    try { encoder.state !== 'closed' && encoder.close() } catch { /* already closed */ }
  }
}

async function pickCodec(config) {
  for (const codec of H264_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ ...config, codec })
      if (supported) return codec
    } catch { /* try the next one */ }
  }
  return null
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas   already sized to the output
 * @param {(frame:number)=>void} o.drawFrame  paints frame N onto the canvas
 * @param {number} o.totalFrames
 * @param {number} o.fps
 * @param {(p:{frame:number,total:number})=>void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{blob:Blob, mime:string, encoder:'webcodecs'|'mediarecorder'}>}
 */
export async function encodeVideo({ canvas, drawFrame, totalFrames, fps, audio, onProgress, signal }) {
  if (webCodecsAvailable()) {
    try {
      return await encodeWithWebCodecs({ canvas, drawFrame, totalFrames, fps, audio, onProgress, signal })
    } catch (err) {
      if (signal?.aborted) throw err
      // Hardware encoder refusals are common and recoverable — fall through.
      console.warn('WebCodecs encode failed, falling back to MediaRecorder:', err)
    }
  }
  return encodeWithMediaRecorder({ canvas, drawFrame, totalFrames, fps, audio, onProgress, signal })
}

async function encodeWithWebCodecs({ canvas, drawFrame, totalFrames, fps, audio, onProgress, signal }) {
  const { Muxer, ArrayBufferTarget } = await import(/* @vite-ignore */ MUXER_CDN)
  const width = canvas.width
  const height = canvas.height

  const base = { width, height, framerate: fps, bitrate: bitrateFor(width, height, fps) }
  const codec = await pickCodec(base)
  if (!codec) throw new Error('No supported H.264 encoder configuration')

  // Narration is encoded before the muxer exists, so its failure can only cost
  // the audio track — never the video.
  let audioCodec = audio?.pcm?.length ? await pickAudioCodec(audio.sampleRate) : null
  let audioChunks = null
  if (audioCodec) {
    try {
      audioChunks = await encodeAudioChunks({ pcm: audio.pcm, sampleRate: audio.sampleRate, codec: audioCodec })
    } catch (e) {
      console.warn('Audio encode failed — rendering silent:', e)
      audioCodec = null
    }
  }

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(audioCodec
      ? { audio: { codec: audioCodec.muxer, numberOfChannels: 1, sampleRate: audio.sampleRate } }
      : {}),
    fastStart: 'in-memory',   // the file must be seekable from a blob: URL
  })
  for (const { chunk, meta } of audioChunks || []) muxer.addAudioChunk(chunk, meta)

  let encodeError = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e },
  })
  encoder.configure({ ...base, codec, latencyMode: 'quality' })

  const frameDur = 1e6 / fps          // microseconds
  const gop = Math.max(1, Math.round(fps * 2))

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      if (encodeError) throw encodeError

      drawFrame(i)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) })
      encoder.encode(frame, { keyFrame: i % gop === 0 })
      frame.close()

      // Backpressure: queueing 1800 frames at once exhausts GPU memory.
      while (encoder.encodeQueueSize > 8) await yieldToLoop()
      if (i % fps === 0) onProgress?.({ frame: i, total: totalFrames })
    }

    await encoder.flush()
    if (encodeError) throw encodeError
    muxer.finalize()
    onProgress?.({ frame: totalFrames, total: totalFrames })
    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      mime: 'video/mp4',
      encoder: 'webcodecs',
      audio: audioCodec ? audioCodec.muxer : null,
    }
  } finally {
    try { encoder.state !== 'closed' && encoder.close() } catch { /* already closed */ }
  }
}

function pickRecorderMime() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return types.find(t => MediaRecorder.isTypeSupported?.(t)) || 'video/webm'
}

/**
 * Play the narration into the recorder's stream. Real time is unavoidable here
 * anyway, so the PCM is scheduled on an AudioContext and captured live.
 */
function attachNarration(stream, audio) {
  if (!audio?.pcm?.length) return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  const ctx = new AC({ sampleRate: audio.sampleRate })
  const buffer = ctx.createBuffer(1, audio.pcm.length, audio.sampleRate)
  buffer.copyToChannel(audio.pcm, 0)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const dest = ctx.createMediaStreamDestination()
  src.connect(dest)
  for (const t of dest.stream.getAudioTracks()) stream.addTrack(t)
  return { ctx, start: () => src.start() }
}

async function encodeWithMediaRecorder({ canvas, drawFrame, totalFrames, fps, audio, onProgress, signal }) {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('This browser cannot record video (no WebCodecs and no MediaRecorder).')
  }
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0]
  const narration = attachNarration(stream, audio)
  const mime = pickRecorderMime()
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(canvas.width, canvas.height, fps) })

  const chunks = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const finished = new Promise((resolve) => { rec.onstop = resolve })
  rec.start()
  narration?.start()

  try {
    // Real time is mandatory here: MediaRecorder timestamps come from the
    // clock, so rendering faster than fps would compress the whole video.
    const interval = 1000 / fps
    const started = performance.now()
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      drawFrame(i)
      track.requestFrame?.()
      const due = started + (i + 1) * interval
      const wait = due - performance.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      if (i % fps === 0) onProgress?.({ frame: i, total: totalFrames })
    }
  } finally {
    try { rec.state !== 'inactive' && rec.stop() } catch { /* nothing recorded */ }
    track.stop()
    narration?.ctx.close().catch(() => {})
  }

  await finished
  onProgress?.({ frame: totalFrames, total: totalFrames })
  return {
    blob: new Blob(chunks, { type: mime }), mime, encoder: 'mediarecorder',
    audio: narration ? 'opus' : null,
  }
}
