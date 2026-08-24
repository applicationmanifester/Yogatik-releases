/**
 * Hands-free voice for the companion.
 *
 * Everything hard here was already solved for Live mode and is reused rather
 * than rewritten: the echo guard, the wake word, the noise gate, the command
 * grammar and the two-engine speaker all come from live/. The companion adds
 * only what is different about it — it is ambient, so it must default to
 * silence, and it lives in a small window that may be a separate document.
 *
 * The FloatingCompanion's own voice code was a bare SpeechRecognition with no
 * echo guard: with speech output on, the mic heard the companion's own reply,
 * treated it as a new question, and answered itself in a loop.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  speechRecognitionAvailable, isEcho, parseVoiceCommand, stripWakeWord,
  shouldRejectNoise, endpointDelay,
} from '../live/cascade'

export function useCompanionVoice({
  onUtterance,
  /** The document the companion lives in — the PiP window is not `window`. */
  targetWindow = typeof window !== 'undefined' ? window : null,
  wakeWord = '',
  enabled = false,
} = {}) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [rate, setRate] = useState(1.05)
  const [heard, setHeard] = useState('')
  const [voiceError, setVoiceError] = useState(null)

  const recogRef = useRef(null)
  const speakerRef = useRef(null)
  const spokenRef = useRef('')       // what the room is about to hear
  const lastReplyRef = useRef('')
  const endpointRef = useRef(null)
  const wantListeningRef = useRef(false)

  const available = speechRecognitionAvailable()

  const getSpeaker = useCallback(async () => {
    if (speakerRef.current) return speakerRef.current
    const { getSharedSpeaker } = await import('../live/voice')
    speakerRef.current = getSharedSpeaker({
      rate,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
    return speakerRef.current
  }, [rate])

  /** Say something out loud, and remember it so the mic does not answer it. */
  const speak = useCallback(async (text) => {
    if (!text || !speechEnabled) return
    lastReplyRef.current = text
    // Recorded BEFORE playback: the echo guard needs to know what is about to
    // be heard, not what has finished being heard.
    spokenRef.current = text
    const speaker = await getSpeaker()
    speaker.speak(text)
  }, [speechEnabled, getSpeaker])

  const shutUp = useCallback(() => {
    speakerRef.current?.cancel()
    setSpeaking(false)
  }, [])

  const stopListening = useCallback(() => {
    wantListeningRef.current = false
    try { recogRef.current?.stop() } catch { /* already stopped */ }
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!available) { setVoiceError('This browser has no speech recognition.'); return false }
    const w = targetWindow || window
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
      || window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) { setVoiceError('This browser has no speech recognition.'); return false }

    wantListeningRef.current = true
    if (recogRef.current) { try { recogRef.current.start() } catch { /* already running */ } ; return true }

    const recog = new Ctor()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = (navigator.language || 'en-US')

    let interim = ''
    recog.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const text = res[0]?.transcript || ''
        if (!res.isFinal) { interim = text; setHeard(text); continue }

        const confidence = res[0]?.confidence ?? 0
        if (shouldRejectNoise(text, confidence)) { interim = ''; continue }
        // The mic hears the speaker. Without this the companion answers its
        // own last sentence, forever.
        if (isEcho(text, spokenRef.current)) { interim = ''; continue }

        // Controls bypass the wake word — "stop" has to work mid-sentence.
        const command = parseVoiceCommand(text)
        if (command) {
          interim = ''
          if (command.type === 'stop' || command.type === 'pause') shutUp()
          else if (command.type === 'repeat') speak(lastReplyRef.current)
          else if (command.type === 'rate') {
            setRate(r => {
              const next = Math.min(2, Math.max(0.6, r + command.delta))
              speakerRef.current?.configure?.({ rate: next })
              return next
            })
          }
          continue
        }

        const { matched, rest } = stripWakeWord(text, wakeWord)
        if (!matched || !rest) { interim = ''; continue }

        // Adaptive endpointing: commit a finished-sounding sentence quickly and
        // give a trailing fragment room to finish.
        clearTimeout(endpointRef.current)
        const delay = endpointDelay(rest)
        endpointRef.current = setTimeout(() => {
          setHeard('')
          onUtterance?.(rest)
        }, delay)
        interim = ''
      }
    }

    recog.onerror = (e) => {
      // A denied mic must not be retried in a tight loop forever.
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        wantListeningRef.current = false
        setVoiceError('Microphone permission was denied.')
        setListening(false)
      }
    }

    // Web Speech stops itself on silence. Without this restart the companion
    // goes deaf a few seconds after it starts listening.
    recog.onend = () => {
      setListening(false)
      if (!wantListeningRef.current) return
      setTimeout(() => {
        if (!wantListeningRef.current) return
        try { recog.start(); setListening(true) } catch { /* racing a stop */ }
      }, 400)
    }

    recogRef.current = recog
    try { recog.start(); setListening(true) } catch { /* already running */ }
    return true
  }, [available, targetWindow, wakeWord, onUtterance, shutUp, speak])

  // Backgrounding a tab kills recognition silently; re-arm when it returns.
  useEffect(() => {
    const doc = (targetWindow || window).document
    const onVisible = () => {
      if (!doc.hidden && wantListeningRef.current && !listening) startListening()
    }
    doc.addEventListener('visibilitychange', onVisible)
    return () => doc.removeEventListener('visibilitychange', onVisible)
  }, [targetWindow, listening, startListening])

  useEffect(() => () => {
    wantListeningRef.current = false
    clearTimeout(endpointRef.current)
    try { recogRef.current?.abort?.() } catch { /* nothing to abort */ }
    speakerRef.current?.cancel?.()
  }, [])

  useEffect(() => { if (!enabled) stopListening() }, [enabled, stopListening])

  return {
    available, listening, speaking, heard, voiceError,
    speechEnabled, setSpeechEnabled,
    rate, setRate,
    startListening, stopListening,
    toggleListening: () => (listening ? stopListening() : startListening()),
    speak, shutUp,
  }
}
