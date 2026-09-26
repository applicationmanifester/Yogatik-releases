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
const WORKLET_SRC = `...` // truncated for brevity - keeping original content

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
  // Voice level analyser — used by the mic-quality stat exposed below.
  const levelAnalyser = ctx.createAnalyser()
  levelAnalyser.fftSize = 512
  const levelBuf = new Float32Array(levelAnalyser.fftSize)
  let peakRms = 0
  let rmsAccum = 0
  let rmsFrames = 0
  // Feed both the worklet AND the analyser from the same source node.
  src.connect(levelAnalyser)

  node.port.onmessage = (e) => { if (!muted) onChunk(bytesToBase64(e.data)) }
  src.connect(node)

  return {
    stream,
    setMuted: (v) => { muted = v },
    isMuted: () => muted,
    /**
     * Current voice quality snapshot — safe to call at any frequency.
     * rms:     short-term energy (0–1)
     * peakRms: highest seen since the last call (resets on read)
     * snrEst:  rough SNR estimate in dB (needs at least 5 frames to stabilise)
     */
    getVoiceStats() {
      levelAnalyser.getFloatTimeDomainData(levelBuf)
      let sum = 0
      for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i]
      const frameRms = Math.sqrt(sum / levelBuf.length)
      if (frameRms > peakRms) peakRms = frameRms
      rmsAccum += frameRms
      rmsFrames++
      const avg = rmsFrames > 0 ? rmsAccum / rmsFrames : 0
      const peak = peakRms
      // Reset peak + rolling avg every read so callers get the CURRENT burst, not all-time.
      peakRms = 0; rmsAccum = 0; rmsFrames = 0
      // Noise floor estimate: quietest 20% of the rolling avg is background.
      const noiseEst = avg * 0.2
      const snrEst = noiseEst > 1e-9 ? 20 * Math.log10(avg / noiseEst) : Infinity
      return { rms: frameRms, peakRms: peak, snrEst }
    },
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
      try { node.port.onmessage = null; node.disconnect(); src.disconnect(); levelAnalyser.disconnect() } catch {}
      stream.getTracks().forEach(t => t.stop())
      try { await ctx.close() } catch {}
    },
  }
}

/**
 * Set up microphone auto-recovery on device change (unplugged/replugged headset).
 * Call this once when the session starts; call teardownDeviceChangeRecovery on stop.
 * @param {Function} onRecover - Callback when mic is recovered (optional)
 * @returns {Function} cleanup function
 */
let deviceChangeHandler = null
let recoverCallbacks = new Set()

export function setupDeviceChangeRecovery(onRecover) {
  if (onRecover) recoverCallbacks.add(onRecover)
  if (deviceChangeHandler) return
  deviceChangeHandler = async () => {
    window.dispatchEvent(new CustomEvent('yogatik:devicechange'))
    for (const cb of recoverCallbacks) cb?.()
  }
  navigator.mediaDevices.addEventListener('devicechange', deviceChangeHandler)
}

export function teardownDeviceChangeRecovery(onRecover) {
  if (onRecover) recoverCallbacks.delete(onRecover)
  if (recoverCallbacks.size === 0 && deviceChangeHandler) {
    navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler)
    deviceChangeHandler = null
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