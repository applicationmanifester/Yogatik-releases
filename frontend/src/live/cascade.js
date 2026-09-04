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
import { splitReasoning } from '../reasoning'
import { createCamera, createScreenCapture, switchCamera as switchCameraTrack } from './video'
import { pickFiller } from './fillers'
import * as metrics from './metrics'
import { enumerate, nextCamera, loadPreferredDevices, savePreferredDevices } from './devices'
import { createSpeaker, defaultLang } from './voice'
import {
  setSharedVisualSource, clearSharedVisualSource,
  isVisualQuestion, needsMotion, captureProfile, describeWithoutModel,
} from '../vision/source'
import { preconnectProvider } from './latencyOptimizer'
import { matchReflex, streamReflex } from './reflexEngine'

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
const ECHO_TAIL_MS = 800      // Keep filtering echo this long after speech ends

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
export const CONTINUATION_CONNECTORS = /\b(and|or|but|because|so|if|that|which|where|when|with|to|then|like|although|plus|as well as|such as|for example|including|meaning)\s*$/i

/**
 * Are these two the SAME thing said once, rather than two utterances?
 *
 * Chrome normalises between the interim result and the final one — it adds a
 * full stop, capitalises the first word, sometimes swaps a homophone. So the
 * endpoint timer commits "hi hello" and the final arrives as "Hi hello.", and
 * a strict equality check lets the duplicate straight through. Compare on
 * letters and digits only.
 */
export function sameUtterance(a = '', b = '') {
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  // The final is often the interim plus a word the speaker trailed off on.
  return x.startsWith(y) || y.startsWith(x)
}

export const INCOMPLETE_STARTERS = /^(?:tell me about|what is|how do|how to|who is|where is|can you|could you|explain|search for|find me|look up|show me|give me|what are|why does|why do)\b/i

export function endpointDelay(text = '') {
  const t = String(text).trim()
  if (/[.!?]$/.test(t)) return 200
  // Semantic continuation gating: If user paused on a connective word or incomplete starter, give them more time
  if (CONTINUATION_CONNECTORS.test(t)) return 650
  const words = t ? t.split(/\s+/).length : 0
  if (words < 6 && INCOMPLETE_STARTERS.test(t)) return 650
  if (words >= 8) return 260
  if (words >= 4) return 360
  return 480
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
/** Consecutive `network` failures before we stop trusting the cloud recogniser. */
export const NETWORK_FAILS_BEFORE_LOCAL = 2

/**
 * What to do about a Web Speech error.
 *
 * `network` was treated as transient and retried with backoff forever. It is
 * not transient on a desktop install: Web Speech streams audio to Google to
 * transcribe it, so a machine that is offline — or an Ollama-only setup that
 * never expected to need the internet — fails every single time, re-emitting
 * the same toast. After a couple of those, switch to on-device Whisper, which
 * is the whole point of the offline promise.
 *
 * @returns {'fatal'|'ignore'|'retry'|'fallback'}
 */
export function classifySpeechError(code, consecutiveNetworkFails = 0) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'fatal'
  if (code === 'no-speech' || code === 'aborted') return 'ignore'
  if (code === 'network' || code === 'service-not-available') {
    return consecutiveNetworkFails + 1 >= NETWORK_FAILS_BEFORE_LOCAL ? 'fallback' : 'retry'
  }
  return 'retry'
}

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

  const PROVIDER_ORIGINS = {
    groq: 'https://api.groq.com',
    gemini: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com',
    openrouter: 'https://openrouter.ai',
    nvidia: 'https://integrate.api.nvidia.com',
  }
  if (PROVIDER_ORIGINS[provider]) preconnectProvider(PROVIDER_ORIGINS[provider])
  for (const fb of fallbacks) {
    if (fb?.provider && PROVIDER_ORIGINS[fb.provider]) preconnectProvider(PROVIDER_ORIGINS[fb.provider])
  }

  let recog = null
  let networkFails = 0
  let localRecognizer = null

  /**
   * Web Speech could not reach its cloud service. Hand the microphone to
   * on-device Whisper and carry on — same handleUtterance, so commands, the
   * wake word, the echo guard and the turn queue all behave identically.
   */
  async function startLocalRecognition() {
    if (localRecognizer || closed) return
    try { recog?.abort?.() } catch { /* already dead */ }
    emit({ type: 'status', message: 'Speech service unreachable — switching to on-device speech.' })
    try {
      const { createLocalRecognizer } = await import('./localSTT')
      localRecognizer = await createLocalRecognizer({
        lang,
        onStatus: (message) => emit({ type: 'status', message }),
        onFinal: (text) => {
          // Muted and echo handling mirror the Web Speech path; without the echo
          // guard the assistant transcribes its own voice and answers itself.
          if (muted || closed) return
          if ((speaking || abort || (Date.now() - speechEndedAt) < ECHO_TAIL_MS) && isEcho(text, spokenAloud)) return
          if (speaking || abort) interrupt()
          handleUtterance(text, 1)
        },
        onError: (err) => emit({ type: 'error', message: `On-device speech: ${err.message}` }),
      })
    } catch (err) {
      localRecognizer = null
      emit({
        type: 'error',
        message: 'Speech recognition is unavailable: the cloud service could not be reached and on-device speech failed to start. You can still type in the transcript panel.',
      })
      void err
    }
  }
  let cam = null
  let screen = null
  let closed = false
  let muted = false
  // AI VOICE OUTPUT, separate from `muted` (which gates the MIC). Nothing in
  // this file could turn the assistant's speaking off without also turning
  // off listening — a user who wants to read captions in a quiet room, or
  // who is on a slow/expensive TTS path and just wants text, had no control
  // for it (the composer's Volume2 icon was imported and never wired to
  // anything). `speak()` is the one choke point every spoken clause already
  // passes through, so muting output costs nothing extra to synthesize.
  let speakerMuted = false
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
    // AI voice output is off: the reply still streams as text/captions (the
    // caller renders those from the same content independently of this
    // function), it just never reaches the synthesiser — no TTS request, no
    // audio, no latency spent on either. spokenAloud is intentionally NOT
    // updated here: nothing is about to play, so there is nothing for the
    // echo guard to filter.
    if (speakerMuted) return
    // Recorded before playback: the echo guard needs to know what the room is
    // about to hear, not what it finished hearing.
    spokenAloud = `${spokenAloud} ${text}`.slice(-400)
    speaker.speak(text)
  }

  // Remembers the last spoken filler across turns so the same line is not used
  // twice in a row; `announced` is reset at the start of every turn.
  const filler = { announced: false, last: '' }

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

    // Early start optimization: Sub-Sentence Phonic Micro-Bursting
    // If opening phrase has no punctuation yet but has reached 3 words, dispatch the first 2 words
    // at word boundary so the user hears voice output within ~100-150ms.
    if (firstChunk && rest.trim()) {
      const words = rest.trim().split(/\s+/)
      if (words.length >= 3) {
        let count = 0
        let cutIdx = -1
        for (let i = 0; i < rest.length; i++) {
          if (/\s/.test(rest[i]) && (i === 0 || !/\s/.test(rest[i - 1]))) {
            count++
            if (count === 2) {
              cutIdx = i + 1
              break
            }
          }
        }
        if (cutIdx > 0) {
          const chunk = rest.slice(0, cutIdx)
          speak(chunk)
          spoken += chunk
          firstChunk = false
        }
      }
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
  let activeTurnText = ''

  function enqueue(text) {
    if (!text.trim()) return
    const t = text.trim()
    if (turnLock) {
      const normActive = activeTurnText.toLowerCase()
      const normNew = t.toLowerCase()
      // If incoming text is an extension or completion of the currently running turn
      // (e.g. user paused mid-sentence, then finished) and voice playback has not started yet:
      // abort the premature turn and restart with the complete text.
      if (normNew.startsWith(normActive) && abort && !spoken) {
        abort.abort()
        abort = null
        queued = t
        return
      }
      // If it is the exact same or already contained, ignore duplicate
      if (normActive === normNew || normActive.startsWith(normNew)) return
      queued = queued ? (queued.toLowerCase().includes(normNew) ? queued : `${queued} ${t}`) : t
      return
    }
    turnLock = (async () => {
      try {
        activeTurnText = t
        await respondTo(t)
        while (queued && !closed) {
          const next = queued
          queued = null
          activeTurnText = next
          await respondTo(next)
        }
      } finally {
        turnLock = null
        activeTurnText = ''
      }
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
    // The clock for time-to-first-word starts the moment the utterance is
    // committed, not when the request is sent — the user experiences the whole
    // gap, including anything we do before calling the model.
    if (retry === 0) metrics.markUtteranceEnd()
    // Reset the once-per-turn guard HERE, at the top, not further down.
    // Placed after the vision filler it would still be true from the previous
    // turn, so the "let me take a closer look" line would fire exactly once
    // per session and then go quiet forever — a filler that only works the
    // first time is worse than none, because the silence returns unexplained.
    // `last` deliberately survives, so two turns do not open identically.
    if (retry === 0) filler.announced = false
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
      // Non-vision model + shared camera/screen: give it eyes on-device ONLY when
      // the question is actually visual or visionMode is 'always'.
      const src = screen || cam
      const needsLocalVision = !modelCanSee && src && visionMode !== 'off' && (visionMode === 'always' || isVisualQuestion(userText) || watched)
      if (needsLocalVision) {
        const line = pickFiller(['identify'], { announced: filler.announced, last: filler.last })
        if (line) { filler.announced = true; filler.last = line; speak(line) }
        const seen = await describeIfVisual(userText)
        if (seen) content = `${userText}\n\n[Live view (described on-device): ${seen}]`
      }
    }

    let failure = null
    let produced = false
    let accumulatedContent = ''
    let emittedAnswerLength = 0
    let emittedReasoningLength = 0

    // Instant Semantic Reflex Intercept (LSRI): Sub-10ms response for conversational courtesies
    if (!parts) {
      const reflex = matchReflex(userText)
      if (reflex) {
        thinking = false
        emit({ type: 'thinking', value: false })
        await streamReflex(reflex, {
          signal: controller.signal,
          onToken: (t) => {
            produced = true
            buffer += t
            emit({ type: 'transcript', role: 'assistant', text: t })
            flushSentences()
            metrics.markFirstWord()
          },
          onDone: ({ content: full }) => {
            if (full?.trim()) {
              history.push({ role: 'assistant', content: full.trim() })
              lastReply = full.trim()
            }
            flushSentences(true)
            metrics.markTurnEnd()
            abort = null
          },
        })
        return
      }
    }

    await new Promise((resolve) => {
      runAgent({
        provider: active.provider, apiKey: active.apiKey, model: active.model,
        history: history.slice(0, -1),
        userMessage: content,
        toolsEnabled: true, webEnabled: true, disabledTools,
        maxTokens: 140,
        modelCanSee: active.modelCanSee ?? modelCanSee,
        persona: `${persona ? persona + '\n\n' : ''}CRITICAL LIVE VOICE DIRECTIVES:
1. Provide quick, precise, accurate, reliable, and brief info. NEVER elongate, lecture, or ramble.
2. Limit spoken replies strictly to 1 to 2 short, crisp sentences (under 30 words total).
3. Deliver the direct answer immediately with zero filler, throat-clearing, or restating the question.
4. If reporting web search, news, or factual info, state ONLY the single top headline or key fact, and offer to give more details if requested.
5. Absolute rule: No markdown, no bullet points, no numbered lists, no headings, no bolding, no emojis, no asterisks, no quotes.
6. You have full tools (image/video gen, file export, code execution, web search). The result appears directly on their screen, so state what was found or completed in one short sentence. Never read long code, data, or search excerpts aloud.\n\n${(active.modelCanSee ?? modelCanSee)
          ? 'You can SEE through the user\'s camera or shared screen: image frames are attached to the conversation when they ask about what is in view. Describe what you actually see.'
          : 'You CANNOT see images directly. When the user asks about their camera or screen, a text description of the current view is inserted automatically as "[Live view (described on-device): …]". Rely ONLY on that description. Never invent, request, or fetch image URLs (e.g. do not make up links like example.com/photo.jpg); if no description was provided, say you could not see it and offer to look again.'}`,
        signal: controller.signal,
        onToken: (t) => {
          accumulatedContent += t
          const isStillThinking = /<think(?:\s[^>]*)?>/i.test(accumulatedContent) && !/<\/think>/i.test(accumulatedContent)
          if (isStillThinking) {
            if (!thinking) { thinking = true; emit({ type: 'thinking', value: true }) }
            const thinkMatch = accumulatedContent.match(/<think(?:\s[^>]*)?>([\s\S]*)$/i)
            if (thinkMatch) {
              const fullReasoning = thinkMatch[1]
              if (fullReasoning.length > emittedReasoningLength) {
                const delta = fullReasoning.slice(emittedReasoningLength)
                emittedReasoningLength = fullReasoning.length
                emit({ type: 'reasoning', text: fullReasoning, delta })
              }
            }
            return
          }
          if (thinking) { thinking = false; emit({ type: 'thinking', value: false }) }

          const { reasoning, answer } = splitReasoning(accumulatedContent)
          if (reasoning) {
            emit({ type: 'reasoning', text: reasoning })
          }
          if (answer.length > emittedAnswerLength) {
            const newChunk = answer.slice(emittedAnswerLength)
            emittedAnswerLength = answer.length
            produced = true
            buffer += newChunk
            emit({ type: 'transcript', role: 'assistant', text: newChunk })
            flushSentences()
            metrics.markFirstWord()
          }
        },
        onStatus: (s) => emit({ type: 'status', text: s }),
        onToolStart: (name) => {
          emit({ type: 'tools', names: [name] })
          // Say something while the tool runs. A web search is 3-4 seconds
          // whatever the model does, and in a SPOKEN conversation that silence
          // reads as a crash — people repeat themselves, which barges in,
          // which cancels the turn, which makes it genuinely broken. Speaking
          // one short line turns the same wait into an ordinary pause.
          //
          // Guarded to once per turn, and never once the model has started its
          // own answer: talking over the reply is worse than the silence.
          const line = pickFiller([name], {
            hasSpoken: produced || !!spoken,
            announced: filler.announced,
            last: filler.last,
          })
          if (line) {
            filler.announced = true
            filler.last = line
            speak(line)
            // A filler IS the first word the user hears. Not counting it would
            // flatter the metric by exactly the number it is meant to measure.
            metrics.markFirstWord()
          }
          metrics.markTool(1)
        },
        onToolResult: (name, result) => emit({ type: 'toolResult', name, result }),
        onDone: ({ content: full }) => {
          const { reasoning, answer } = splitReasoning(full || accumulatedContent)
          if (reasoning) emit({ type: 'reasoning', text: reasoning })
          if (answer.length > emittedAnswerLength) {
            const finalChunk = answer.slice(emittedAnswerLength)
            emittedAnswerLength = answer.length
            buffer += finalChunk
            emit({ type: 'transcript', role: 'assistant', text: finalChunk })
          }
          flushSentences(true)
          metrics.markTurnEnd()
          if (thinking) { thinking = false; emit({ type: 'thinking', value: false }) }
          if (answer?.trim()) { history.push({ role: 'assistant', content: answer.trim() }); lastReply = answer.trim() }
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
    const friendlyError = `I was unable to complete the response using ${active.provider || 'the model'}: ${failure}. Please check your API key in Settings or switch to Gemini or Groq.`
    emit({ type: 'transcript', role: 'assistant', text: friendlyError })
    emit({ type: 'warning', message: failure })
    speak(friendlyError)
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

    // What the endpoint timer already committed, and when.
    //
    // THIS IS THE DUPLICATION BUG. Committing on a silence timer is what cuts
    // Chrome's ~1s wait off the front of every reply — but the FINAL result
    // still arrives a moment later with the same words, and nothing stopped it
    // being handled a second time. The user said "what are you saying" once and
    // the caption read "what are you sayingwhat are you saying", because the
    // utterance really was submitted twice: once from the timer, once from the
    // final. The model answered it twice too.
    let committed = ''
    let committedAt = 0
    const COMMIT_ECHO_MS = 2500

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
      if ((speaking || abort) && (finalText || heard.length >= MIN_BARGE_CHARS)) {
        // `spokeAfter` is the whole point of recording this. An interrupt
        // followed by nothing is noise or the assistant's own echo, and that
        // is the failure people never report — they just stop using it.
        metrics.markBargeIn(!!heard.trim())
        interrupt()
      }

      if (muted) return

      if (finalText.trim()) {
        const text = finalText.trim()
        clearEndpoint()
        pendingInterim = ''
        // Drop the final if the endpoint timer already sent this. Compared on
        // the normalised text rather than by identity, because Chrome tidies
        // punctuation and capitalisation between the interim and the final —
        // "hi hello" becomes "Hi hello." and a strict === would let it through.
        if (Date.now() - committedAt < COMMIT_ECHO_MS && sameUtterance(text, committed)) return
        committed = text
        committedAt = Date.now()
        handleUtterance(text, finalConfidence)
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
          if (text.length >= 2) {
            committed = text
            committedAt = Date.now()
            handleUtterance(text, 0)
          }
        }, endpointDelay(pendingInterim))
      }
    }

    recog.onerror = (e) => {
      clearEndpoint()
      const verdict = classifySpeechError(e.error, networkFails)
      if (verdict === 'ignore') return
      if (verdict === 'fatal') {
        recogFatal = true   // restarting a denied mic spins forever
        emit({ type: 'error', message: 'Microphone access was blocked. Allow it in your browser and try again.' })
        return
      }
      if (verdict === 'fallback' || e.error === 'network' || e.error === 'service-not-available') {
        recogFatal = true   // stop the retry storm; switch immediately to on-device Whisper
        startLocalRecognition()
        return
      }
      restartDelay = Math.min(restartDelay ? restartDelay * 2 : 500, 8000)
      emit({ type: 'status', message: `Reconnecting speech recognition (${e.error})…` })
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
      startLocalRecognition()
      if (camera) {
        try { await enableCamera(true) } catch (camErr) {
          console.warn('Live: camera unavailable, starting audio-only', camErr)
        }
      }
      document.addEventListener('visibilitychange', onVisibility)
      emit({ type: 'ready' })
      return
    }
    // Warm the voice list; on Chrome the first getVoices() is empty.
    try { speechSynthesis.getVoices() } catch { /* no synthesiser */ }
    if (camera) {
      try { await enableCamera(true) } catch (camErr) {
        console.warn('Live: camera unavailable, starting audio-only', camErr)
      }
    }
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
      // Open the camera the user last chose. A remembered device that is gone
      // falls back to any camera inside createCamera rather than throwing
      // OverconstrainedError and failing the whole call.
      const pref = loadPreferredDevices()
      cam = await createCamera({ deviceId: pref.cameraId, facingMode: pref.facing || 'user' })
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
    // Releases the mic track, the AudioContext and the segmentation timer;
    // leaking those keeps the OS mic indicator lit after the call ends.
    try { localRecognizer?.stop() } catch { /* already stopped */ }
    localRecognizer = null
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
    /**
     * Change the voice mid-call. The shared speaker is reconfigured rather than
     * recreated, so a reply already being spoken finishes in the old voice
     * instead of being cut off mid-word.
     */
    setVoice: (v) => {
      if (!v) return { success: false, error: 'No voice given.' }
      speaker.configure({ voice: v })
      return { success: true }
    },

    /**
     * Swap between the on-device neural voice and the browser's built-in one.
     * Switching TO neural may take a moment on the first use (~90MB); the
     * speaker falls back to the system voice while it downloads rather than
     * going silent.
     */
    setVoiceEngine: (e) => {
      if (e !== 'neural' && e !== 'system') return { success: false, error: `Unknown voice engine: ${e}` }
      speaker.configure({ engine: e })
      return { success: true }
    },

    /** Change recognition + speaking language mid-call (BCP-47, e.g. es-ES). */
    setLang: (l) => { if (l) { lang = l; speaker.configure({ lang }); if (recog) { try { recog.lang = lang } catch { /* mid-restart */ } } } },
    /**
     * Turn the AI's spoken VOICE on/off, independent of the mic (`setMuted`).
     * Muting output cancels whatever is playing right now (a reply already
     * mid-sentence does not keep talking after the button is pressed) but
     * never touches the turn itself — the model keeps answering, keeps using
     * tools, and the text/caption stream is untouched; only the trip through
     * the synthesiser stops.
     */
    setSpeakerMuted: (v) => {
      speakerMuted = !!v
      if (speakerMuted && speaking) { speaker.cancel().catch(() => {}) }
      emit({ type: 'speaker-muted', value: speakerMuted })
    },
    getSpeakerMuted: () => speakerMuted,
    /** Current frame for the vision panel — never opens a second camera. */
    grabFrame: (profile) => (screen || cam)?.grab(true, profile) || null,

    /** Change the active model mid-call without interrupting or dropping the session. */
    setModel: (newModel, newModelCanSee) => {
      if (!newModel) return
      active.model = newModel
      if (typeof newModelCanSee === 'boolean') {
        active.modelCanSee = newModelCanSee
      }
      emit({ type: 'provider', provider: active.provider, model: active.model })
    },
    setProvider: (newProvider, newApiKey, newModel, newModelCanSee) => {
      if (newProvider) active.provider = newProvider
      if (newApiKey !== undefined) active.apiKey = newApiKey
      if (newModel) active.model = newModel
      if (typeof newModelCanSee === 'boolean') active.modelCanSee = newModelCanSee
      emit({ type: 'provider', provider: active.provider, model: active.model })
    },

    listDevices: () => enumerate(),

    /**
     * Swap the camera without ending the call: the TRACK is replaced on the
     * existing stream, so the preview, the aHash gate and the `see` tool all
     * keep the same MediaStream and none of them notice.
     */
    async switchCamera({ deviceId, facingMode } = {}) {
      if (!cam) return { success: false, error: 'The camera is off.' }
      try {
        const info = await switchCameraTrack(cam, { deviceId, facingMode })
        savePreferredDevices({ cameraId: info.deviceId, facing: facingMode || '' })
        emit({ type: 'camera', stream: cam.stream, video: cam.video, deviceId: info.deviceId, label: info.label })
        return { success: true, ...info }
      } catch (e) {
        return { success: false, error: e?.message || 'Could not switch camera' }
      }
    },

    async flipCamera() {
      if (!cam) return { success: false, error: 'The camera is off.' }
      const { cameras } = await enumerate()
      const currentId = cam.stream.getVideoTracks()[0]?.getSettings?.().deviceId || ''
      const next = nextCamera(cameras, currentId)
      if (!next) return { success: false, error: 'Only one camera is available.' }
      return this.switchCamera({ deviceId: next.deviceId, facingMode: next.facing || undefined })
    },

    /**
     * Cascade listens through the Web Speech API, which picks the microphone
     * itself and accepts NO deviceId — so this cannot switch mics the way the
     * realtime engine can. Saying so is the whole point: silently ignoring the
     * choice would look exactly like a switch that did not take effect.
     */
    async switchMic() {
      return {
        success: false,
        error: 'On this engine the microphone follows your system default — '
          + 'browser speech recognition does not accept a device choice. '
          + 'Change it in your OS sound settings, or use the realtime engine.',
      }
    },

    get cameraOn() { return !!cam },
    get screenOn() { return !!screen },
  }
}