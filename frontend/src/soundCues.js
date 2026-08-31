/**
 * Optional sound cues for send / reply / error.
 *
 * SYNTHESISED, not bundled. Three audio files would be ~40KB of assets, another
 * three network requests, and a licensing question — for a feature that is off
 * by default. A short shaped sine costs nothing and ships as maths.
 *
 * Rules that come from how this kind of feature usually goes wrong:
 *
 *  - OFF BY DEFAULT. A chat app that starts making noise is a chat app people
 *    mute at the OS level and then never hear anything from again.
 *  - NEVER on a restored/streamed-in message the user is already looking at.
 *    The cue exists for a reply that lands while attention is elsewhere.
 *  - AUTOPLAY IS BLOCKED until the user has interacted with the page. Creating
 *    the AudioContext lazily, on the first cue, means it is created inside a
 *    real gesture rather than at import time where it would start suspended.
 *  - Respects prefers-reduced-motion? No — that is motion. This checks the
 *    user's own setting only, because a sound has no motion equivalent.
 */

let ctx = null
let enabled = false
let volume = 0.25

/** Cue shapes: [frequency Hz, duration s, type]. Kept short — a cue, not a tune. */
const CUES = {
  send: [{ f: 660, d: 0.07, t: 'sine' }],
  reply: [{ f: 523.25, d: 0.08, t: 'sine' }, { f: 783.99, d: 0.10, t: 'sine', delay: 0.07 }],
  error: [{ f: 311.13, d: 0.13, t: 'triangle' }, { f: 233.08, d: 0.16, t: 'triangle', delay: 0.11 }],
}

export function configureSoundCues({ enabled: on, volume: vol } = {}) {
  if (typeof on === 'boolean') enabled = on
  if (Number.isFinite(vol)) volume = Math.max(0, Math.min(1, vol))
}

export function soundCuesEnabled() { return enabled }

function audio() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  try { ctx = new AC() } catch { return null }
  return ctx
}

/**
 * Play one cue. Silent and safe when disabled, unsupported, or blocked —
 * a failed sound must never surface as an error to the user.
 */
export function playCue(name) {
  if (!enabled) return false
  const shape = CUES[name]
  if (!shape) return false
  const ac = audio()
  if (!ac) return false

  try {
    // A context created before any gesture starts suspended; resuming is a
    // no-op when it is already running.
    if (ac.state === 'suspended') ac.resume().catch(() => {})
    const now = ac.currentTime
    for (const part of shape) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const start = now + (part.delay || 0)
      osc.type = part.t || 'sine'
      osc.frequency.setValueAtTime(part.f, start)
      // A raw gate on a sine CLICKS at both ends. The short ramps are what
      // make this sound like a cue rather than a fault.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + part.d)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(start + part.d + 0.02)
    }
    return true
  } catch { return false }
}

/** Release the context — a held AudioContext keeps an audio device awake. */
export function closeSoundCues() {
  try { ctx?.close() } catch { /* already gone */ }
  ctx = null
}

export const CUE_NAMES = Object.keys(CUES)
