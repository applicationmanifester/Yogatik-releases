/**
 * Face-to-face for providers with no realtime API — Groq, OpenAI, OpenRouter,
 * NVIDIA, or the on-device model.
 *
 * Web Speech recognition -> the normal agent (tools and all) -> speech synthesis,
 * with a camera frame attached when the model can see AND the question is about
 * what is in front of the user. Slower than Gemini Live (~1.2-2s vs ~0.8s)
 * because each stage waits for the one before it, but it runs on whatever key
 * the user already has.
 *
 * Exposes exactly the interface createLiveSession does, so the call UI does not
 * know or care which engine is behind it.
 */

/**
 * @typedef {Object} CascadeEvent
 * @property {'ready'|'camera'|'screen'|'level'|'speaking'|'thinking'|'transcript'|'tools'|'toolResult'|'voice'|'provider'|'reconnecting'|'error'|'ended'|'interrupted'|'status'|'watched'|'looked'|'muted'} type
 * @property {MediaStream} [stream]
 * @property {number} [value]
 * @property {string} [role]
 * @property {string} [text]
 * @property {string[]} [names]
 * @property {string} [name]
 * @property {any} [result]
 * @property {string} [engine]
 * @property {string} [provider]
 * @property {string} [model]
 * @property {string} [message]
 * @property {number} [attempt]
 * @property {number} [frames]
 * @property {string} [via]
 * @property {boolean} [active]
 * @property {string} [who]
 */

/**
 * @typedef {Object} CascadeSession
 * @property {Function} start
 * @property {Function} stop
 * @property {Function} enableCamera
 * @property {Function} enableScreenShare
 * @property {Function} sendText
 * @property {Function} watch
 * @property {Function} setMuted
 * @property {Function} isMuted
 * @property {Function} grabFrame
 * @property {boolean} cameraOn
 * @property {boolean} screenOn
 */

/**
 * @param {Object} o
 * @param {string} o.provider
 * @param {string} o.apiKey
 * @param {string} o.model
 * @param {string} [o.persona]
 * @param {string[]} [o.disabledTools]
 * @param {boolean} [o.modelCanSee]
 * @param {boolean} [o.camera]
 * @param {string} [o.voice]
 * @param {string} [o.voiceEngine]
 * @param {string} [o.lang]
 * @param {number} [o.rate]
 * @param {Object[]} [o.fallbacks]
 * @param {Function} o.onEvent     (CascadeEvent) => void
 */

import { runAgent } from '../agent'
import { createCamera, createScreenCapture } from './video'
import { createSpeaker, defaultLang } from './voice'
import {
  setSharedVisualSource, clearSharedVisualSource,
  isVisualQuestion, needsMotion, captureProfile, describeWithoutModel,
} from '../vision/source'

const SENTENCE = /([.!?…]+["')\]]*\s+|\n{2,})/
// The first thing said should leave the mouth as early as possible; a clause is
// enough to start on and saves ~400ms versus waiting for a full sentence.
const CLAUSE = /([,;:]\s+|[.!?…]+\s+|\n)/

export function speechRecognitionAvailable() {
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

const MAX_HISTORY_TURNS = 20   // Keep context tight for fast providers
const MIN_BARGE_CHARS = 6      // Shorter than this is usually echo or a cough
const ECHO_TAIL_MS = 1500      // Keep filtering echo this long after speech ends

/** Loose overlap test: is `heard` just the synthesiser being picked up again? */
export function isEcho(heard, spoken) {
  if (!heard || !spoken) return false
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const h = norm(heard)
  const s = norm(spoken)
  if (!h) return false
  if (s.includes(h)) return true
  const words = h.split(' ').filter(w => w.length > 2)
  if (!words.length) return false
  const hits = words.filter(w => s.includes(w)).length
  return hits / words.length > 0.6
}

// ─── Adaptive endpointing ──────────────────────────────────────────────────
// Chrome sits on isFinal ~1s, so we commit on a silence timer instead. A longer,
// complete-sounding utterance can commit sooner; a short fragment waits a touch
// longer in case the speaker is only pausing. Cuts perceived latency vs a fixed
// 700ms without chopping people off mid-thought.
export function endpointDelay(text = '') {
  const t = String(text).trim()
  if (/[.!?]$/.test(t)) return 350
  const words = t ? t.split(/\s+/).length : 0
  if (words >= 8) return 450
  if (words >= 4) return 650
  return 850
}

// ─── Hands-free voice commands ─────────────────────────────────────────────
const LANG_MAP = {
  english: 'en-US', spanish: 'es-ES', french: 'fr-FR', german: 'de-DE',
  italian: 'it-IT', portuguese: 'pt-BR', hindi: 'hi-IN', japanese: 'ja-JP',
  korean: 'ko-KR', chinese: 'zh-CN', mandarin: 'zh-CN', arabic: 'ar-SA',
  russian: 'ru-RU', dutch: 'nl-NL', telugu: 'te-IN', tamil: 'ta-IN',
}

/**
 * Recognise a spoken control command from a WHOLE utterance (anchored, so
 * "stop the car" is content, "stop" is a command). Returns null for normal
 * speech. Commands are handled locally and never sent to the model.
 */
export function parseVoiceCommand(text = '') {
  const t = String(text).trim().toLowerCase().replace(/[.!?,]+$/, '')
  if (!t) return null
  if (/^(stop|stop talking|be quiet|quiet|shut up|cancel|never ?mind)$/.test(t)) return { type: 'stop' }
  if (/^(pause|mute)$/.test(t)) return { type: 'pause' }
  if (/^(resume|unmute|continue|keep going|go ahead)$/.test(t)) return { type: 'resume' }
  if (/^(repeat|repeat that|say that again|come again|what did you say|pardon)$/.test(t)) return { type: 'repeat' }
  if (/^(speak (faster|quicker)|talk faster|faster)$/.test(t)) return { type: 'rate', delta: 0.15 }
  if (/^(speak (slower|more slowly)|talk slower|slow down|slower)$/.test(t)) return { type: 'rate', delta: -0.15 }
  const lang = t.match(/^(?:speak|talk|switch|respond|reply)\s+(?:in\s+|to\s+)?(\w+)$/)
  if (lang && LANG_MAP[lang[1]]) return { type: 'language', lang: LANG_MAP[lang[1]], name: lang[1] }
  return null
}

/**
 * Wake-word gate. With no wake word set, everything passes. With one set, an
 * utterance must begin with it; the wake word is stripped and the remainder
 * returned. (Control commands bypass this so "stop" always works.)
 */
export function stripWakeWord(text = '', wake = '') {
  const t = String(text).trim()
  if (!wake) return { matched: true, rest: t }
  const w = String(wake).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^\\s*${w}[\\s,!.:-]*`, 'i')
  if (re.test(t)) return { matched: true, rest: t.replace(re, '').trim() }
  return { matched: false, rest: t }
}

/**
 * VAD-ish noise gate for FINAL results. Web Speech reports a confidence on
 * finals; drop a short, low-confidence final (usually TV / background chatter).
 * Chrome often reports confidence 0 for continuous finals, so 0 is treated as
 * "unknown" and never rejected — only a real, low positive score is.
 */
export function shouldRejectNoise(text = '', confidence = 0) {
  const t = String(text).trim()
  if (t.length < 2) return true
  const words = t.split(/\s+/).length
  if (confidence > 0 && confidence < 0.35 && words <= 2) return true
  return false
}

/** Trim history to the last N turns, keeping the window aligned to a user turn. */
export function trimHistoryPairs(history = [], maxTurns = MAX_HISTORY_TURNS) {
  const h = history.slice()
  while (h.length > maxTurns) {
    h.shift()
    if (h.length && h[0].role === 'assistant') h.shift()
  }
  return h
}

export function createCascadeSession({
  provider, apiKey, model, persona = null, disabledTools = [],
  modelCanSee = false, camera = true, voice = null, voiceEngine = 'system',
  lang = defaultLang(), rate = 1.05,
  // 'auto'  — describe/attach a frame only when the user asks about the view (or
  //           auto-scan noticed a change). 'always' — every turn while a source
  //           is live (any model sees continuously). 'off' — never.
  visionMode = 'auto',
  // Hands-free: require this phrase to start a spoken turn (null = always on).
  wakeWord = null,
  // Handle spoken control words (stop / pause / repeat / faster / language…).
  voiceCommands = true,
  // Providers to fall back to when this one dies mid-call, from getLiveConfig.
  fallbacks = [],
  onEvent = () => {},
}) {
  // The active provider can change mid-call: a 429 five minutes into a
  // conversation should not end it.
  let active = { provider, apiKey, model, modelCanSee }
  const chain = [active, ...fallbacks]
  let chainIndex = 0

  let recog = null
  let cam = null
  let screen = null
  let closed = false
  let muted = false
  let speaking = false
  let thinking = false
  let abort = null
  let restartDelay = 0
  let recogFatal = false
  let speechEndedAt = 0   // when the synthesiser last stopped (echo-tail guard)
  let lastReply = ''      // for the "repeat that" voice command
  const history = []

  const emit = (e) => { if (!closed) onEvent(e) }

  // ─── Output: speak as clauses complete, not after the whole reply ───
  let spoken = ''        // text already queued to the synthesiser
  let buffer = ''
  let spokenAloud = ''   // rolling record of what the speakers emitted (echo guard)
  let firstChunk = true

  const speaker = createSpeaker({
    engine: voiceEngine, voice, lang, rate,
    onStart: () => { speaking = true; emit({ type: 'speaking', value: true }) },
    onEnd: () => { speaking = false; speechEndedAt = Date.now(); emit({ type: 'speaking', value: false }) },
    onEngine: (e) => emit({ type: 'voice', engine: e }),
  })

  const speak = (text) => {
    if (!text.trim()) return
    // Recorded before playback: the echo guard needs to know what the room is
    // about to hear, not what it finished hearing.
    spokenAloud = `${spokenAloud} ${text}`.slice(-400)
    speaker.speak(text)
  }

  const flushSentences = (final = false) => {
    let rest = buffer.slice(spoken.length)
    if (final) {
      if (rest.trim()) { speak(rest); spoken = buffer }
      firstChunk = true
      return
    }
    // Break the opening chunk at the first clause; everything after it at
    // sentence boundaries, which sounds far more natural.
    const re = firstChunk ? CLAUSE : SENTENCE
    let m
    while ((m = re.exec(rest))) {
      const end = m.index + m[0].length
      speak(rest.slice(0, end))
      spoken += rest.slice(0, end)
      rest = rest.slice(end)
      firstChunk = false
    }
  }

  /** Barge-in, done by hand: kill the voice and abandon the generation. */
  const interrupt = async () => {
    if (!speaking && !abort) return
    // Stop synthesis first - wait for it to complete
    await speaker.cancel()
    abort?.abort()
    abort = null
    speaking = false
    // Arm the echo tail: cancelled audio can still echo for a moment. Keep
    // spokenAloud so that residual echo is filtered rather than looped back.
    speechEndedAt = Date.now()
    emit({ type: 'interrupted' })
    emit({ type: 'speaking', value: false })
  }

  // ─── Turn queue ───
  // Two finals can land while a turn is in flight (long answers, tool rounds).
  // Without this the session runs two agents at once and talks over itself.
  let turnLock = null
  let queued = null

  function enqueue(text) {
    if (!text.trim()) return
    if (turnLock) { queued = queued ? `${queued} ${text}` : text; return }
    turnLock = (async () => {
      try {
        await respondTo(text)
        while (queued && !closed) {
          const next = queued
          queued = null
          await respondTo(next)
        }
      } finally { turnLock = null }
    })()
  }

  // ─── Spoken control commands + wake word + noise gate ───
  function handleCommand(cmd) {
    switch (cmd.type) {
      case 'stop': interrupt(); return
      case 'pause': muted = true; interrupt(); emit({ type: 'muted', value: true }); return
      case 'resume': muted = false; emit({ type: 'muted', value: false }); return
      case 'repeat':
        if (lastReply) { emit({ type: 'status', text: 'Repeating…' }); speak(lastReply) }
        return
      case 'rate':
        rate = Math.max(0.6, Math.min(1.6, Math.round((rate + cmd.delta) * 100) / 100))
        speaker.configure({ rate })
        emit({ type: 'status', text: `Speaking ${cmd.delta > 0 ? 'faster' : 'slower'}` })
        return
      case 'language':
        lang = cmd.lang
        speaker.configure({ lang })
        if (recog) { try { recog.lang = lang } catch { /* mid-restart */ } }
        emit({ type: 'status', text: `Switching to ${cmd.name}` })
        return
      default:
    }
  }

  /**
   * Route one recognised utterance: control commands first (always work), then
   * the wake-word gate for content, then the noise gate, then to the agent.
   */
  function handleUtterance(raw, confidence = 0) {
    const text = String(raw || '').trim()
    if (!text) return
    if (voiceCommands) {
      const cmd = parseVoiceCommand(text)
      if (cmd) { handleCommand(cmd); return }
    }
    if (wakeWord) {
      const { matched, rest } = stripWakeWord(text, wakeWord)
      if (!matched || !rest) return
      if (shouldRejectNoise(rest, confidence)) return
      enqueue(rest)
      return
    }
    if (shouldRejectNoise(text, confidence)) return
    enqueue(text)
  }

  // Auto-scan: the newest frame in which something actually changed, waiting to
  // be attached to the next turn. One frame, only when the scene moved — that
  // is the difference between "keeps up" and "burns 1.1k tokens a second".
  let watched = null

  function watch() {
    const src = screen || cam
    // force=false: an unchanged room returns null and costs nothing.
    const b64 = src?.grab(false, captureProfile(''))
    if (b64) { watched = b64; emit({ type: 'watched' }) }
  }

  const framePart = (b64) => ({
    type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` },
  })

  /** Grab the frames this question actually needs, or nothing. */
  function visualParts(userText) {
    const src = screen || cam
    if (!modelCanSee || visionMode === 'off') return null

    // 'always' + a live source → attach a frame every turn (model watches).
    const always = visionMode === 'always' && !!src

    if (!always && !isVisualQuestion(userText)) {
      // Not a question about the room — but if auto-scan noticed a change,
      // let the model see it once.
      if (!watched) return null
      const frame = watched
      watched = null
      return [framePart(frame)]
    }
    watched = null
    if (!src) return null
    const frames = []
    const b64 = src.grab(true, captureProfile(userText))
    if (!b64) return null
    if (needsMotion(userText)) {
      const prev = src.previousFrame?.()
      if (prev) frames.push(prev)
    }
    frames.push(b64)
    return frames.map(framePart)
  }

  /**
   * When the model cannot take images but the user IS asking about the camera or
   * screen they've shared, describe the frame on-device (OCR/VLM) and hand the
   * model that text — so "provided access" actually reaches any model, not just
   * vision ones. Mirrors the `see` tool, but proactive.
   */
  async function describeIfVisual(userText) {
    const src = screen || cam
    if (modelCanSee || !src || visionMode === 'off') return null
    // 'always' → describe every turn. 'auto' → on visual questions, or reuse a
    // frame auto-scan already flagged as changed. This is what lets ANY model,
    // vision-capable or not, "see" the live camera/screen and answer about it.
    const want = visionMode === 'always' || isVisualQuestion(userText)
    let b64 = null
    if (want) b64 = src.grab(true, captureProfile(userText))
    else if (watched) { b64 = watched; watched = null }
    if (!b64) return null
    try {
      emit({ type: 'status', text: 'Looking (on-device)…' })
      const { text } = await describeWithoutModel(`data:image/jpeg;base64,${b64}`, userText)
      if (text?.trim()) { emit({ type: 'looked', frames: 1, via: 'on-device' }); return text.trim() }
    } catch { /* fall through — answer without the frame */ }
    return null
  }

  /** Rate limits and outages are recoverable; ending the call is not. */
  function nextProvider() {
    if (chainIndex + 1 >= chain.length) return false
    chainIndex++
    active = chain[chainIndex]
    emit({ type: 'status', text: `Switched to ${active.provider}` })
    emit({ type: 'provider', provider: active.provider, model: active.model })
    return true
  }

  const RECOVERABLE = /429|rate.?limit|50\d|timeout|network|overload/i

  // ─── A turn ───
  async function respondTo(userText, retry = 0) {
    if (!userText.trim() || closed) return
    if (retry === 0) {
      emit({ type: 'transcript', role: 'user', text: userText })
      history.push({ role: 'user', content: userText })
    }

    // Trim history so token overhead stays low, keeping user/assistant pairs
    // aligned (a bare leading assistant turn confuses some providers).
    history.splice(0, history.length, ...trimHistoryPairs(history, MAX_HISTORY_TURNS))

    thinking = true
    emit({ type: 'thinking', value: true })

    buffer = ''; spoken = ''; firstChunk = true
    const controller = new AbortController()
    abort = controller

    // A frame is ~1.1k tokens. Send it when the question is about the room,
    // not on every "what's the capital of Peru". When the model cannot see,
    // the `see` tool routes a frame to OCR / the on-device VLM instead.
    let content = userText
    const parts = visualParts(userText)
    if (parts) {
      content = [{ type: 'text', text: userText }, ...parts]
      emit({ type: 'looked', frames: parts.length })
    } else {
      // Non-vision model + shared camera/screen: give it eyes on-device.
      const seen = await describeIfVisual(userText)
      if (seen) content = `${userText}\n\n[Live view (described on-device): ${seen}]`
    }

    let failure = null
    let produced = false

    await new Promise((resolve) => {
      runAgent({
        provider: active.provider, apiKey: active.apiKey, model: active.model,
        history: history.slice(0, -1),
        userMessage: content,
        toolsEnabled: true, webEnabled: true, disabledTools,
        modelCanSee: active.modelCanSee ?? modelCanSee,
        persona: `${persona ? persona + '\n\n' : ''}You are in a live spoken conversation, heard through the user's microphone. Reply the way a person speaks: short sentences, no markdown, no lists, no headings, no emoji. Two or three sentences unless asked for more. You have full tools: generate images and videos, create and export files, run code and automated tests and report the results, and search the web — the result is shown on their screen, so just say briefly what you made or found. Never read out long code or file contents aloud. For a big, multi-part request, delegate to specialists that run in parallel (spawn_agents / crew_orchestrator) and then say the result in a sentence or two.\n\n${(active.modelCanSee ?? modelCanSee)
          ? 'You can SEE through the user\'s camera or shared screen: image frames are attached to the conversation when they ask about what is in view. Describe what you actually see.'
          : 'You CANNOT see images directly. When the user asks about their camera or screen, a text description of the current view is inserted automatically as "[Live view (described on-device): …]". Rely ONLY on that description. Never invent, request, or fetch image URLs (e.g. do not make up links like example.com/photo.jpg); if no description was provided, say you could not see it and offer to look again.'}`,
        signal: controller.signal,
        onToken: (t) => {
          if (thinking) { thinking = false; emit({ type: 'thinking', value: false }) }
          produced = true
          buffer += t
          emit({ type: 'transcript', role: 'assistant', text: t })
          flushSentences()
        },
        onStatus: (s) => emit({ type: 'status', text: s }),
        onToolStart: (name) => emit({ type: 'tools', names: [name] }),
        onToolResult: (name, result) => emit({ type: 'toolResult', name, result }),
        onDone: ({ content: full }) => {
          flushSentences(true)
          if (thinking) { thinking = false; emit({ type: 'thinking', value: false }) }
          if (full?.trim()) { history.push({ role: 'assistant', content: full }); lastReply = full.trim() }
          abort = null
          resolve()
        },
        onError: (e) => {
          if (thinking) { thinking = false; emit({ type: 'thinking', value: false }) }
          failure = e?.message || String(e)
          abort = null
          resolve()
        },
      })
    })

    if (!failure) return

    // Only switch before anything was spoken — swapping mid-answer would
    // splice two different models' sentences into one reply.
    if (!produced && !closed && retry < chain.length - 1 &&
        RECOVERABLE.test(failure) && nextProvider()) {
      return respondTo(userText, retry + 1)
    }
    emit({ type: 'error', message: failure })
  }

  // ─── Input: continuous recognition ───
  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    recog = new SR()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = lang

    // Chrome can sit on a final result for ~1s after the speaker stops. Firing
    // on a silence timer instead cuts that off the front of every reply.
    let pendingInterim = ''
    let endpointTimer = null
    const clearEndpoint = () => { clearTimeout(endpointTimer); endpointTimer = null }

    recog.onresult = (e) => {
      let finalText = ''
      let interim = ''
      let finalConfidence = 0
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) { finalText += r[0].transcript; finalConfidence = r[0].confidence || 0 }
        else interim += r[0].transcript
      }

      const heard = (finalText || interim).trim()
      // The synthesiser's audio is still in the room (and in the recogniser's
      // buffer) for a beat AFTER playback ends, so guard for a tail window too —
      // otherwise the echoed FINAL transcript lands with speaking already false,
      // gets enqueued, and the assistant answers its own voice in a loop.
      const echoWindow = speaking || abort || (Date.now() - speechEndedAt) < ECHO_TAIL_MS
      if (echoWindow && isEcho(heard, spokenAloud)) return
      // Genuine barge-in only counts while actually speaking (not during the tail).
      if ((speaking || abort) && (finalText || heard.length >= MIN_BARGE_CHARS)) interrupt()

      if (muted) return

      if (finalText.trim()) {
        clearEndpoint()
        pendingInterim = ''
        handleUtterance(finalText.trim(), finalConfidence)
        return
      }
      if (interim.trim()) {
        pendingInterim = interim.trim()
        clearEndpoint()
        // Adaptive: a complete-sounding phrase commits sooner than a fragment.
        endpointTimer = setTimeout(() => {
          const text = pendingInterim
          pendingInterim = ''
          endpointTimer = null
          if (text.length >= 2) handleUtterance(text, 0)
        }, endpointDelay(pendingInterim))
      }
    }

    recog.onerror = (e) => {
      clearEndpoint()
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        recogFatal = true   // restarting a denied mic spins forever
        emit({ type: 'error', message: 'Microphone access was blocked. Allow it in your browser and try again.' })
        return
      }
      if (e.error === 'no-speech' || e.error === 'aborted') return
      // network / audio-capture are transient — back off rather than hammer.
      restartDelay = Math.min(restartDelay ? restartDelay * 2 : 500, 8000)
      emit({ type: 'error', message: `Speech recognition failed: ${e.error}` })
    }

    // Recognition stops itself constantly (silence, tab focus). Restart it, or
    // the call goes deaf after the first pause.
    recog.onend = () => {
      clearEndpoint()
      if (closed || recogFatal) return
      setTimeout(() => {
        if (closed || recogFatal) return
        try { recog.start(); restartDelay = 0 } catch { /* already starting */ }
      }, restartDelay)
    }

    recog.start()
  }

  // Backgrounding a tab suspends recognition and it does not always come back.
  const onVisibility = () => {
    if (closed || recogFatal || document.hidden) return
    try { recog?.start() } catch { /* already running */ }
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
    try { speechSynthesis.getVoices() } catch { /* no synthesiser */ }
    if (camera) await enableCamera(true)
    startRecognition()
    document.addEventListener('visibilitychange', onVisibility)
    emit({ type: 'ready' })
  }

  async function enableScreenShare(on) {
    if (on && !screen) {
      try {
        screen = await createScreenCapture()
        setSharedVisualSource(screen)
        emit({ type: 'screen', stream: screen.stream, active: true })
        // If screen sharing stops from browser UI, auto-disable
        screen.stream.getVideoTracks()[0].addEventListener('ended', () => {
          clearSharedVisualSource(screen)
          screen = null
          if (cam) setSharedVisualSource(cam)
          emit({ type: 'screen', stream: null, active: false })
        })
      } catch {
        emit({ type: 'error', message: 'Screen sharing was cancelled or not supported.' })
      }
    } else if (!on && screen) {
      clearSharedVisualSource(screen)
      screen.close()
      screen = null
      if (cam) setSharedVisualSource(cam)
      emit({ type: 'screen', stream: null, active: false })
    }
  }

  async function enableCamera(on) {
    if (on && !cam) {
      cam = await createCamera()
      // The `see` tool must borrow this stream: a second getUserMedia fails
      // on most phones, which used to make `see` unusable inside a call.
      if (!screen) setSharedVisualSource(cam)
      emit({ type: 'camera', stream: cam.stream, video: cam.video })
    } else if (!on && cam) {
      clearSharedVisualSource(cam)
      cam.close(); cam = null
      emit({ type: 'camera', stream: null })
    }
  }

  function stop() {
    if (closed) return
    closed = true
    document.removeEventListener('visibilitychange', onVisibility)
    try { recog?.abort() } catch {}
    speaker.close()
    abort?.abort()
    clearSharedVisualSource(cam)
    clearSharedVisualSource(screen)
    cam?.close()
    screen?.close()
    recog = null; cam = null; screen = null
    onEvent({ type: 'ended' })
  }

  return {
    start,
    stop,
    enableCamera,
    enableScreenShare,
    sendText: (t) => enqueue(t),
    /** Auto-scan tick: remember the scene if it changed, say nothing. */
    watch,
    setMuted: (v) => { muted = v; if (v) interrupt(); emit({ type: 'muted', value: v }) },
    isMuted: () => muted,
    /** Let ANY model watch the feed continuously: 'auto' | 'always' | 'off'. */
    setVisionMode: (mode) => { if (['auto', 'always', 'off'].includes(mode)) { visionMode = mode; emit({ type: 'status', text: `Vision: ${mode}` }) } },
    getVisionMode: () => visionMode,
    /** Hands-free: require a phrase to start each spoken turn (null to disable). */
    setWakeWord: (w) => { wakeWord = w ? String(w).trim() : null },
    /** Change speaking rate (0.6–1.6) mid-call. */
    setRate: (r) => { rate = Math.max(0.6, Math.min(1.6, Number(r) || rate)); speaker.configure({ rate }) },
    /** Change recognition + speaking language mid-call (BCP-47, e.g. es-ES). */
    setLang: (l) => { if (l) { lang = l; speaker.configure({ lang }); if (recog) { try { recog.lang = lang } catch { /* mid-restart */ } } } },
    /** Current frame for the vision panel — never opens a second camera. */
    grabFrame: (profile) => (screen || cam)?.grab(true, profile) || null,
    get cameraOn() { return !!cam },
    get screenOn() { return !!screen },
  }
}