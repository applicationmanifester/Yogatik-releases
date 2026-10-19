import React, { useCallback, useEffect, useReducer, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { isEnabled } from '../features'
import { useCompanionVoice } from '../companion/useCompanionVoice'

/**
 * TvVoiceOverlay — hands-free input for the 10-foot [data-device="tv"] UI.
 *
 * A TV cannot be typed into from the couch: the D-pad walks a 24px composer
 * at a few seconds per character, and the whole point of the living-room
 * device class is that the person on the couch has no pointer at all. So,
 * when the user opts into `features.tvVoice` (OFF by default — a TV that
 * opens its own microphone unprompted is a room with ears), this overlay
 * offers an always-at-hand big-bodied listen control, a status line, and a
 * mic mute toggle.
 *
 * Nothing here implements speech recognition. The mic is the SAME pipeline
 * Live's cascade sessions and the FloatingCompanion already speak through:
 * `useCompanionVoice` (echo guard, noise gate, wake-word, adaptive
 * endpointing) built on live/cascade's STT primitives. The overlay only
 * decides when that hook may listen and where a completed utterance lands —
 * `onCommit(text)` pushes it into the App composer and the normal send()
 * path takes it from there, exactly like typed input.
 *
 * D-pad contract (all of it covered by the TV focus rules in
 * 15-device-adaptive.css — nothing reaches for a mouse):
 *   - the wake button and the mute toggle are Tab-reachable (roving), 48px+
 *     targets with a visible 4px focus ring when focused;
 *   - Enter / Space on the wake button toggles listening;
 *   - Escape closes the overlay (and stops the mic);
 *   - focus is never trapped: no autofocus on mount, no focus steal on
 *     utterance commit, and Tab moves in and out freely.
 */

/* ────────────────────────── PURE CORE (no DOM) ────────────────────────── */

/** The two booleans the 10-foot UI state machine turns. */
export const TV_VOICE_IDLE = { listening: false, muted: false }

/**
 * Pure listening state machine — the intent the overlay drives the shared
 * recognition hook towards. Exported for tests.
 *
 *   wake   — Enter/Space (or click) on the wake button: start listening; a
 *            first press on a muted mic unmutes AND starts (two separate
 *            10-foot presses to speak would be one too many).
 *   sleep  — stop listening (Escape / device change / close). The mic mute
 *            toggle is deliberately NOT flipped: muted is a standing
 *            privacy preference, sleep is a transport control.
 *   mute   — listening off + muted on (standing preference until unmuting).
 *   unmute — clear the mute preference; listening stays off until woken.
 *
 * @param {{ listening: boolean, muted: boolean }} [state]
 * @param {{ type: string }} [action]
 * @returns {{ listening: boolean, muted: boolean }}
 */
export function tvVoiceMachine(state = TV_VOICE_IDLE, action = {}) {
  switch (action?.type) {
    case 'wake':
      if (state.muted) return { ...state, muted: false, listening: true }
      return { ...state, listening: !state.listening }
    case 'sleep':
      return state.listening ? { ...state, listening: false } : state
    case 'mute':
      return state.muted ? state : { ...state, listening: false, muted: true }
    case 'unmute':
      return state.muted ? { ...state, muted: false } : state
    default:
      return state
  }
}

/**
 * One human-ish line for the status row, from the same facts the overlay
 * sees. Pure; exported for tests.
 *
 * Error > mute > unavailable > live (with interim text) > paused.
 *
 * @param {{ available?: boolean, listening?: boolean, muted?: boolean, heard?: string, error?: string }} m
 * @returns {string}
 */
export function tvStatusText({ available = true, listening = false, muted = false, heard = '', error = '' } = {}) {
  if (error) return error
  if (muted) return 'Mic muted — press the button to unmute'
  if (!available) return 'Voice recognition is not available in this browser'
  if (listening) return heard ? `Heard: “${heard.trim()}”` : 'Listening — say a message'
  return 'Voice paused — press Enter to listen'
}

/** The current data-device class on <html>, or '' when it has not been written yet. Pure. */
export function readDeviceClass(doc = (typeof document !== 'undefined' ? document : undefined)) {
  return doc?.documentElement?.dataset?.device || ''
}

/* ───────────────────────────── COMPONENT ───────────────────────────── */

export function TvVoiceOverlay({
  features = {},
  onCommit,
  onClose,
  /** test seam — forces the device answer instead of reading <html>. */
  device,
}) {
  const [state, dispatch] = useReducer(tvVoiceMachine, TV_VOICE_IDLE)
  const [closed, setClosed] = useState(false)
  const [deviceNow, setDeviceNow] = useState(readDeviceClass)

  // deviceClass.js rewrites data-device on resize/orientation after its own
  // debounce; nothing announces it to React, so (a) mirror its events and
  // (b) re-read once after the mount effect — children effects run before
  // App's initDeviceClass, so the very first read can legitimately see ''.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const recheck = () => setDeviceNow(readDeviceClass())
    const catchUp = setTimeout(recheck, 0)
    window.addEventListener('resize', recheck, { passive: true })
    window.addEventListener('orientationchange', recheck, { passive: true })
    return () => {
      clearTimeout(catchUp)
      window.removeEventListener('resize', recheck)
      window.removeEventListener('orientationchange', recheck)
    }
  }, [])

  const isTv = (device ?? deviceNow) === 'tv'
  const featureOn = isEnabled(features, 'tvVoice')
  const active = isTv && featureOn

  const commit = useCallback((text) => {
    const t = String(text || '').trim()
    if (t) onCommit?.(t)
  }, [onCommit])

  /**
   * The mic. Reused verbatim — Live's cascade STT hook; `enabled: active`
   * means it can only ever be listening while this overlay is actually on
   * screen (the hook force-stops whenever `enabled` is false, so a feature
   * flip or a device switch can never leave an orphan mic running).
   */
  const {
    available, listening: micLive, heard, voiceError,
    startListening, stopListening,
  } = useCompanionVoice({
    onUtterance: commit,
    enabled: active,
    wakeWord: '',
  })

  // Drive the shared hook to the machine's intent: start/stop tracking the
  // desired state, not the mic's async acks.
  useEffect(() => {
    if (!active || !available) return undefined
    if (state.muted || !state.listening) {
      if (micLive) stopListening()
      return undefined
    }
    if (!micLive) startListening()
    return undefined
  }, [active, available, state.listening, state.muted, micLive, startListening, stopListening])

  // Escape closes. No capture, no stopPropagation — if another surface has
  // a better claim on Escape it keeps it; the overlay just leaves.
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setClosed(true)
      dispatch({ type: 'sleep' })
      onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose])

  // A re-enabled overlay starts fresh — Escape-closed earlier in the session
  // must not swallow the next deliberate on from Personalise.
  useEffect(() => {
    if (!active) setClosed(false)
  }, [active])

  const toggleWake = useCallback((e) => {
    if (e) e.preventDefault()
    dispatch({ type: 'wake' })
  }, [])

  const onWakeKey = useCallback((e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault() // a plain div[role=button]: keep scroll out of Space
    dispatch({ type: 'wake' })
  }, [])

  const toggleMute = useCallback(() => {
    dispatch(state.muted ? { type: 'unmute' } : { type: 'mute' })
  }, [state.muted])

  if (!active || closed) return null

  const statusText = tvStatusText({
    available,
    listening: state.listening || micLive,
    muted: state.muted,
    heard,
    error: voiceError || '',
  })
  const listeningNow = !state.muted && (state.listening || micLive)

  return (
    <section className="tv-voice-overlay" aria-label="TV voice control">
      <div
        role="button"
        tabIndex={0}
        className={`tv-voice-wake ${listeningNow ? 'active' : ''}`}
        onClick={toggleWake}
        onKeyDown={onWakeKey}
        aria-pressed={listeningNow}
        aria-label={listeningNow ? 'Stop listening' : 'Listen'}
        title={listeningNow ? 'Stop listening (Enter)' : 'Listen (Enter / Space)'}
      >
        <Mic size={26} aria-hidden="true" />
        <span>{listeningNow ? 'Listening' : 'Voice'}</span>
      </div>
      <p className="tv-voice-status" aria-live="polite">{statusText}</p>
      <button
        type="button"
        className={`tv-voice-mic-toggle ${state.muted ? 'muted' : ''}`}
        onClick={toggleMute}
        aria-pressed={state.muted}
        aria-label={state.muted ? 'Unmute microphone' : 'Mute microphone'}
        title={state.muted ? 'Mic muted — press to unmute' : 'Mute the microphone'}
      >
        {state.muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
        <span>{state.muted ? 'Mic muted' : 'Mic on'}</span>
      </button>
    </section>
  )
}
