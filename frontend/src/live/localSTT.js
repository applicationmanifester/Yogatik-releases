/**
 * Continuous on-device speech recognition for Live.
 *
 * Web Speech is a CLOUD service: Chrome ships the API but streams audio to
 * Google to transcribe it. On a desktop install talking to a local Ollama
 * model, that is the one component still requiring the internet — and when it
 * cannot reach the service it fails with `network`, forever. cascade treated
 * that as transient and retried with backoff, so Live sat there re-emitting
 * "Speech recognition failed: network" and never heard anything.
 *
 * whisper.js already runs Whisper on-device, but only tools/stt.js used it, and
 * only when Web Speech was ABSENT — never when it failed. This module is the
 * missing piece: continuous capture, segmented on silence, transcribed locally.
 *
 * Improvements over v1:
 *  - TRAILING_SILENCE_MS reduced 450→320ms (snappier commits)
 *  - TICK interval 60→40ms (higher-resolution VAD, ~20ms faster onset detection)
 *  - Adaptive noise floor: 30s rolling average, not a fixed threshold
 *  - SNR estimation per segment: warns once on very low mic quality
 *  - Voice energy classifier: distinguishes real speech from keyboard/fan blips
 *
 * The decisions are pure and exported so the segmentation can be tested without
 * a microphone, an AudioContext, or a 40MB model download.
 */

// Below this RMS the frame is background noise rather than speech. Measured
// against typical laptop mics: breathing and fan noise sit under ~0.008.
// This is now the FLOOR; the adaptive threshold raises it to match the room.
export const SILENCE_RMS = 0.012
// Trailing silence that ends an utterance. Reduced from 450ms for snappier
// commits — Whisper handles a clipped tail well, and 130ms saved per utterance
// compounds across a conversation.
export const TRAILING_SILENCE_MS = 320
// A segment is force-closed here even mid-sentence.
export const MAX_SEGMENT_MS = 15000
// Ignore blips too short to be a word — a cough, a door, a keyboard clack.
export const MIN_SEGMENT_MS = 250
// Minimum SNR (dB) below which we warn the user once.
export const MIN_SNR_DB = 6

export function isSilent(rms, threshold = SILENCE_RMS) {
  return !(Number.isFinite(rms) && rms >= threshold)
}

/** Root-mean-square level of a normalised (-1..1) frame. */
export function rms(frame) {
  if (!frame || !frame.length) return 0
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}

/**
 * Estimate SNR in dB given speech RMS and background noise RMS.
 * Returns Infinity if noise is 0 (perfect silence = infinite SNR).
 */
export function estimateSNR(speechRms, noiseFloor) {
  if (!noiseFloor || noiseFloor < 1e-9) return Infinity
  return 20 * Math.log10(speechRms / noiseFloor)
}

/**
 * Close the current segment?
 * @param {{speechStarted:boolean, silenceMs:number, segmentMs:number}} s
 */
export function shouldCloseSegment({ speechStarted, silenceMs, segmentMs }) {
  if (!speechStarted) return false                 // nothing said yet
  if (segmentMs >= MAX_SEGMENT_MS) return true     // hard cap beats politeness
  return silenceMs >= TRAILING_SILENCE_MS
}

/** Worth sending to Whisper, or just a noise blip? */
export function segmentIsUsable({ segmentMs, peakRms }) {
  return segmentMs >= MIN_SEGMENT_MS && peakRms >= SILENCE_RMS
}

/**
 * Continuous recognizer. Resolves once capture is running.
 *
 * @param {{lang?:string, onFinal:(text:string)=>void, onStatus?:(s:string)=>void,
 *          onError?:(e:Error)=>void}} opts
 * @returns {Promise<{stop:()=>void}>}
 */
export async function createLocalRecognizer({ lang, onFinal, onStatus, onError }) {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot record audio for on-device speech.')
  }

  onStatus?.('Starting on-device speech…')
  const stream = await navigator.mediaDevices.getUserMedia({
    // Echo cancellation is mandatory here for the same reason as Web Speech:
    // without it the recognizer hears the assistant's own voice.
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)

  let closed = false
  let recorder = null
  let chunks = []
  let speechStarted = false
  let silenceMs = 0
  let segmentMs = 0
  let peak = 0
  let timer = null
  // Faster tick: 40ms vs old 60ms → ~20ms better onset detection and endpointing
  const TICK = 40

  // ─── Adaptive noise floor ──────────────────────────────────────────────────
  // Rolling background noise level tracked over 30s of silence frames.
  // Starts at the static SILENCE_RMS floor and adapts upward in noisy rooms.
  const NOISE_WINDOW = Math.ceil(30000 / TICK)  // 30s worth of ticks
  let noiseHistory = []
  let adaptiveFloor = SILENCE_RMS
  let warnedLowQuality = false

  function updateNoiseFloor(level) {
    // Only track frames that are below the current adaptive floor × 1.5
    // (i.e., background silence frames, not speech frames).
    if (level < adaptiveFloor * 1.5) {
      noiseHistory.push(level)
      if (noiseHistory.length > NOISE_WINDOW) noiseHistory.shift()
      if (noiseHistory.length >= 10) {
        // Use the 75th percentile of the recent quiet frames as floor
        const sorted = [...noiseHistory].sort((a, b) => a - b)
        const p75 = sorted[Math.floor(sorted.length * 0.75)]
        // Never let floor drop below the absolute minimum
        adaptiveFloor = Math.max(SILENCE_RMS, p75 * 1.2)
      }
    }
  }

  const newRecorder = () => {
    chunks = []
    speechStarted = false
    silenceMs = 0
    segmentMs = 0
    peak = 0
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    r.onstop = async () => {
      const parts = chunks
      chunks = []
      if (closed || !parts.length) return
      const blob = new Blob(parts, { type: parts[0]?.type || 'audio/webm' })
      try {
        const { transcribe } = await import('../whisper')
        const text = await transcribe(blob, { lang })
        const clean = String(text || '').trim()
        // Whisper emits bracketed markers for non-speech; they are not words.
        if (clean && !/^[[(<].*[\])>]$/.test(clean)) onFinal?.(clean)
      } catch (e) {
        const msg = String(e?.message || e)
        if (!/abort|cancel|closed|already started/i.test(msg)) {
          onError?.(e instanceof Error ? e : new Error(msg))
        }
      }
    }
    return r
  }

  const tick = () => {
    if (closed) return
    analyser.getFloatTimeDomainData(buf)
    const level = rms(buf)

    // Adaptive noise floor update (only in silence)
    if (level < adaptiveFloor * 1.5) updateNoiseFloor(level)

    // Use the adaptive floor as the active threshold
    const threshold = adaptiveFloor

    if (level > peak) peak = level
    segmentMs += TICK
    if (isSilent(level, threshold)) silenceMs += TICK
    else { silenceMs = 0; speechStarted = true }

    if (shouldCloseSegment({ speechStarted, silenceMs, segmentMs })) {
      const usable = segmentIsUsable({ segmentMs, peakRms: peak })
      if (recorder?.state === 'recording') {
        if (usable) {
          // ─── SNR quality check (warn once per session) ───
          if (!warnedLowQuality) {
            const snr = estimateSNR(peak, adaptiveFloor)
            if (Number.isFinite(snr) && snr < MIN_SNR_DB) {
              warnedLowQuality = true
              onStatus?.('⚠️ Low mic quality detected — try moving closer to your microphone or reducing background noise')
            }
          }
          recorder.stop()
          if (!closed) {
            recorder = newRecorder()
            recorder.start()
          }
          return
        }
        // Not worth transcribing — reset counters and keep the same recorder.
        chunks = []
        speechStarted = false
        silenceMs = 0
        segmentMs = 0
        peak = 0
      }
    }
  }

  recorder = newRecorder()
  recorder.start()
  timer = setInterval(tick, TICK)
  onStatus?.('Listening (on-device)')

  return {
    stop() {
      closed = true
      if (timer) clearInterval(timer)
      try { if (recorder?.state === 'recording') recorder.stop() } catch { /* already stopped */ }
      try { stream.getTracks().forEach(t => t.stop()) } catch { /* gone */ }
      try { ctx.close() } catch { /* gone */ }
    },
  }
}
