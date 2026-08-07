/**
 * Face-to-face for providers with no realtime API — Groq, OpenAI, OpenRouter,
 * NVIDIA, or the on-device model.
 *
 * Web Speech recognition -> the normal agent (tools and all) -> speech synthesis,
 * with a camera frame attached when the model can see. Slower than Gemini Live
 * (~1.5-2.5s vs ~0.8s) because each stage waits for the one before it, but it
 * runs on whatever the user already has a key for.
 *
 * Exposes exactly the interface createLiveSession does, so the call UI does not
 * know or care which engine is behind it.
 */

import { runAgent } from '../agent'
import { createCamera } from './video'

const SENTENCE = /([.!?…]+["')\]]*\s+|\n{2,})/

export function speechRecognitionAvailable() {
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function createCascadeSession({
  provider, apiKey, model, persona = null, disabledTools = [],
  modelCanSee = false, camera = true, voiceName = null, lang = 'en-US',
  onEvent = () => {},
}) {
  let recog = null
  let cam = null
  let closed = false
  let muted = false
  let speaking = false
  let abort = null
  const history = []

  const emit = (e) => { if (!closed) onEvent(e) }

  // ─── Output: speak as sentences complete, not after the whole reply ───
  let spoken = ''      // text already queued to the synthesiser
  let buffer = ''

  const speak = (text) => {
    if (!text.trim()) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    if (voiceName) {
      const v = speechSynthesis.getVoices().find(x => x.name === voiceName)
      if (v) u.voice = v
    }
    u.rate = 1.05
    u.onstart = () => { speaking = true; emit({ type: 'speaking', value: true }) }
    u.onend = () => {
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        speaking = false
        emit({ type: 'speaking', value: false })
      }
    }
    speechSynthesis.speak(u)
  }

  const flushSentences = (final = false) => {
    let rest = buffer.slice(spoken.length)
    if (final) {
      if (rest.trim()) { speak(rest); spoken = buffer }
      return
    }
    let m
    while ((m = SENTENCE.exec(rest))) {
      const end = m.index + m[0].length
      speak(rest.slice(0, end))
      spoken += rest.slice(0, end)
      rest = rest.slice(end)
    }
  }

  /** Barge-in, done by hand: kill the voice and abandon the generation. */
  const interrupt = () => {
    if (!speaking && !abort) return
    speechSynthesis.cancel()
    abort?.abort()
    abort = null
    speaking = false
    emit({ type: 'interrupted' })
    emit({ type: 'speaking', value: false })
  }

  // ─── A turn ───
  async function respondTo(userText) {
    if (!userText.trim()) return
    emit({ type: 'transcript', role: 'user', text: userText })
    history.push({ role: 'user', content: userText })

    buffer = ''; spoken = ''
    const controller = new AbortController()
    abort = controller

    // The model sees the room only if it can; otherwise the `see` tool routes
    // the frame to the on-device VLM instead.
    let content = userText
    if (cam && modelCanSee) {
      const b64 = cam.grab(true)
      if (b64) {
        content = [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ]
      }
    }

    await new Promise((resolve) => {
      runAgent({
        provider, apiKey, model,
        history: history.slice(0, -1),
        userMessage: content,
        toolsEnabled: true, webEnabled: true, disabledTools,
        modelCanSee,
        persona: `${persona ? persona + '\n\n' : ''}You are in a live spoken conversation, seen and heard through the user's camera and microphone. Reply the way a person speaks: short sentences, no markdown, no lists, no headings, no emoji. Two or three sentences unless asked for more. Never describe what you are doing.`,
        signal: controller.signal,
        onToken: (t) => {
          buffer += t
          emit({ type: 'transcript', role: 'assistant', text: t })
          flushSentences()
        },
        onStatus: (s) => emit({ type: 'status', text: s }),
        onToolStart: (name) => emit({ type: 'tools', names: [name] }),
        onToolResult: (name, result) => emit({ type: 'toolResult', name, result }),
        onDone: ({ content: full }) => {
          flushSentences(true)
          if (full?.trim()) history.push({ role: 'assistant', content: full })
          abort = null
          resolve()
        },
        onError: (e) => {
          emit({ type: 'error', message: e?.message || String(e) })
          abort = null
          resolve()
        },
      })
    })
  }

  // ─── Input: continuous recognition ───
  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recog = new SR()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = lang

    recog.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      // Any speech at all cuts the model off — this is the barge-in.
      if ((interim.trim().length > 1 || finalText) && (speaking || abort)) interrupt()
      if (finalText.trim() && !muted) respondTo(finalText.trim())
    }
    recog.onerror = (e) => {
      if (e.error === 'not-allowed') {
        emit({ type: 'error', message: 'Microphone access was blocked. Allow it in your browser and try again.' })
        return
      }
      if (e.error === 'no-speech' || e.error === 'aborted') return
      emit({ type: 'error', message: `Speech recognition failed: ${e.error}` })
    }
    // Recognition stops itself constantly (silence, tab focus). Restart it, or
    // the call goes deaf after the first pause.
    recog.onend = () => { if (!closed) { try { recog.start() } catch {} } }
    recog.start()
  }

  async function start() {
    if (!speechRecognitionAvailable()) {
      emit({
        type: 'error',
        message: 'This browser has no speech recognition. Live works here in Chrome, Edge, or Safari — or add a Gemini key for the realtime engine, which does not need it.',
      })
      return
    }
    // Warm the voice list; on Chrome the first getVoices() is empty.
    try { speechSynthesis.getVoices() } catch {}
    if (camera) await enableCamera(true)
    startRecognition()
    emit({ type: 'ready' })
  }

  async function enableCamera(on) {
    if (on && !cam) {
      cam = await createCamera()
      emit({ type: 'camera', stream: cam.stream, video: cam.video })
    } else if (!on && cam) {
      cam.close(); cam = null
      emit({ type: 'camera', stream: null })
    }
  }

  function stop() {
    if (closed) return
    closed = true
    try { recog?.abort() } catch {}
    try { speechSynthesis.cancel() } catch {}
    abort?.abort()
    cam?.close()
    recog = null; cam = null
    onEvent({ type: 'ended' })
  }

  return {
    start,
    stop,
    enableCamera,
    sendText: (t) => respondTo(t),
    setMuted: (v) => { muted = v; if (v) interrupt(); emit({ type: 'muted', value: v }) },
    isMuted: () => muted,
    get cameraOn() { return !!cam },
  }
}
