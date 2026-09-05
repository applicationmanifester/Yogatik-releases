/**
 * Realtime audio I/O for the Live session.
 *
 * Capture: AudioContext forced to 16kHz so the browser resamples in native code
 * — hand-rolled JS resampling was audibly worse and cost a frame of latency.
 * Playback: a separate 24kHz context with a scheduled queue, so chunks butt up
 * against each other sample-exactly instead of clicking.
 */

import { audioConstraints } from './devices'

// Inlined so there is no extra public/ asset to lose on deploy.
const WORKLET_SRC = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(512); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) {
        // 512 frames @16kHz = 32ms — ultra-low latency for snappy VAD while
        // keeping message rate manageable (~31/sec).
        const pcm = new Int16Array(this.n)
        for (let j = 0; j < this.n; j++) {
          const s = Math.max(-1, Math.min(1, this.buf[j]))
          pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer])
        this.n = 0
      }
    }
    return true
  }
}
registerProcessor('capture', Capture)
`

export function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  // Chunked: String.fromCharCode(...) on a whole buffer blows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function base64ToPcm16(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

/** Microphone -> 32ms base64 PCM16 chunks (ultra-low latency). */
export async function createMicCapture(onChunk, { deviceId = '', noiseSuppression = true } = {}) {
  // The echo guards live in devices.audioConstraints — they are not optional
  // and must not be re-spelled per call site, or one of them loses a guard and
  // the session starts hearing itself.
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia(audioConstraints({ deviceId, noiseSuppression }))
  } catch (err) {
    // A remembered microphone that has been unplugged fails the whole call.
    // Fall back to the system default rather than refusing to start.
    if (deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
      stream = await navigator.mediaDevices.getUserMedia(audioConstraints({ noiseSuppression }))
    } else throw err
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
  try {
    await ctx.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }

  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'capture', { numberOfOutputs: 0 })
  let muted = false
  node.port.onmessage = (e) => { if (!muted) onChunk(bytesToBase64(e.data)) }
  src.connect(node)

  return {
    stream,
    setMuted: (v) => { muted = v },
    isMuted: () => muted,
    async setNoiseSuppression(enabled) {
      const track = stream.getAudioTracks()[0]
      if (track && typeof track.applyConstraints === 'function') {
        try {
          await track.applyConstraints({ noiseSuppression: !!enabled })
          return true
        } catch {
          return false
        }
      }
      return false
    },
    async close() {
      try { node.port.onmessage = null; node.disconnect(); src.disconnect() } catch {}
      stream.getTracks().forEach(t => t.stop())
      try { await ctx.close() } catch {}
    },
  }
}

/**
 * Gapless playback queue for the model's audio.
 * `onLevel` drives the UI orb; `flush` implements barge-in.
 */
export function createPlayer({ onLevel, onSpeakingChange } = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
  const gain = ctx.createGain()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 128   // smaller FFT = faster level updates for orb animation
  gain.connect(analyser)
  analyser.connect(ctx.destination)

  let nextAt = 0
  let live = new Set()
  let speaking = false
  let raf = null
  const data = new Uint8Array(analyser.frequencyBinCount)

  const setSpeaking = (v) => {
    if (v === speaking) return
    speaking = v
    onSpeakingChange?.(v)
    if (v && !raf) tick()
  }

  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128)
    onLevel?.(peak)
    raf = speaking ? requestAnimationFrame(tick) : (onLevel?.(0), null)
  }

  return {
    /** @param {Int16Array} pcm @param {number} rate */
    push(pcm, rate = 24000) {
      if (ctx.state === 'suspended') ctx.resume()
      const buf = ctx.createBuffer(1, pcm.length, rate)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
      const node = ctx.createBufferSource()
      node.buffer = buf
      node.connect(gain)
      // Never schedule in the past — that is what produces the stutter when a
      // chunk arrives late.
      const at = Math.max(ctx.currentTime + 0.005, nextAt)
      node.start(at)
      nextAt = at + buf.duration
      live.add(node)
      setSpeaking(true)
      node.onended = () => {
        live.delete(node)
        if (!live.size) setSpeaking(false)
      }
    },
    /** Barge-in: drop everything queued, immediately. */
    flush() {
      for (const n of live) { try { n.onended = null; n.stop() } catch {} }
      live = new Set()
      nextAt = 0
      setSpeaking(false)
    },
    /**
     * AI voice output on/off. The realtime server keeps streaming audio
     * either way (this is a receive-only WSS — there is no "stop sending"
     * message to send it), so this mutes at the GAIN node rather than
     * dropping the connection: silent, instant, and reversible without a
     * reconnect. Queued/incoming chunks still schedule and play through
     * `push`, they are just inaudible while muted.
     */
    setMuted(v) { gain.gain.value = v ? 0 : 1 },
    isMuted: () => gain.gain.value === 0,
    resume: () => ctx.resume(),
    async close() {
      this.flush()
      try { await ctx.close() } catch {}
    },
  }
}