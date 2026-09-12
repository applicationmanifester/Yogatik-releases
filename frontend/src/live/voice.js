/**
 * The voice of a live call.
 *
 * Two engines behind one interface:
 *  - `system`  — speechSynthesis. Zero latency, zero download, robotic.
 *  - `neural`  — Kokoro-82M on-device (the same model that narrates rendered
 *                video), played through an AudioContext. Far better, ~90MB
 *                once, and a few hundred ms slower to start each clause.
 *
 * The neural engine cannot be used the moment a call opens (the weights are
 * still downloading), so it starts on the system voice and upgrades itself
 * mid-conversation the instant the model is ready. Waiting silently for 90MB
 * before answering the first question would be worse than a robotic sentence.
 *
 * Everything is queued: speak() is called once per clause as tokens stream in,
 * and clauses must be heard in order, never overlapped.
 */

/**
 * @typedef {Object} SpeakerEngine
 * @property {'system'|'neural'|'loading'} engine
 * @property {string} voice
 * @property {string} lang
 * @property {number} rate
 */

/**
 * @typedef {Object} Speaker
 * @property {Function} speak - Queue a clause. Order is preserved; overlapping speech is never allowed.
 * @property {Function} cancel - Barge-in: stop mid-word and drop everything still queued.
 * @property {Function} close - Clean up resources.
 * @property {Function} configure - Update voice/lang/rate/engine on the shared speaker without recreating it.
 * @property {boolean} speaking - Whether currently speaking.
 * @property {boolean} usingNeural - Whether neural engine is ready and in use.
 */

import { synthesize, loadNarrator, narratorCached, DEFAULT_VOICE } from '../video/speech'

/** How long a clause will wait for the neural voice before going robotic. */
const WAIT_WHEN_CACHED_MS = 400

/** Voice ids are engine-specific; this maps the neural ones to a system hint. */
const SYSTEM_HINT = {
  af_heart: /female|samantha|zira|aria|cortana|karen/i,
  af_nova: /female|samantha|zira|aria/i,
  am_michael: /male|david|guy|mark|james/i,
  am_puck: /male|david|guy|mark/i,
  bf_emma: /(en-gb|british).*female|hazel|sonia|susan/i,
  bm_george: /(en-gb|british).*male|george|ryan|richard/i,
}

/** How long a clause will wait for the neural voice before going robotic. */
export function createSpeaker({
  engine = 'neural',
  voice = DEFAULT_VOICE,
  lang = 'en-US',
  rate = 1.08,
  onStart = () => {},
  onEnd = () => {},
  onEngine = () => {},
  // Injected in tests.
  synth = synthesize,
  preload = loadNarrator,
  cached = narratorCached,
} = {}) {
  let neuralReady = false
  let ready = null              // the in-flight load, so a clause can wait on it
  let cancelled = false
  let speaking = false
  let queue = []
  let pumping = false
  let audioCtx = null
  let current = null            // active AudioBufferSourceNode

  // Warm the model immediately. If it was downloaded in an earlier session it
  // decompresses in a second or two, so the first clause waits for it and the
  // user never hears the robot at all. Cold (~90MB), waiting would be rude, so
  // the call talks badly until it lands and upgrades mid-conversation.
  if (engine === 'neural') {
    onEngine('loading')  // NEW: notify UI immediately
    ready = preload()
      .then(() => { neuralReady = true; onEngine('neural'); return true })
      .catch(() => { onEngine('system'); return false })   // stay robotic, stay working
  }

  // Pre-warm the browser's speech synthesis engine, voice catalog, and OS audio thread
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices()
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      // Pre-warm audio thread in browser runtime only (disabled in Vitest unit test environment)
      const isVitest = typeof globalThis !== 'undefined' && Boolean(globalThis.process?.env?.VITEST || globalThis.__vitest__)
      if (typeof SpeechSynthesisUtterance !== 'undefined' && !isVitest) {
        const silent = new SpeechSynthesisUtterance(' ')
        silent.volume = 0.001
        window.speechSynthesis.speak(silent)
      }
    } catch { /* ignore */ }
  }

  const waitForNeural = async () => {
    if (neuralReady) return true
    if (!ready || !cached()) return false
    return Promise.race([
      ready,
      new Promise(resolve => setTimeout(() => resolve(false), WAIT_WHEN_CACHED_MS)),
    ])
  }

  const ctx = () => {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext
      audioCtx = new AC()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    return audioCtx
  }

  const began = () => { if (!speaking) { speaking = true; onStart() } }
  function speakSystem(text) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      u.rate = rate
      const hint = SYSTEM_HINT[voice]
      if (hint) {
        const v = speechSynthesis.getVoices()
          .find(x => hint.test(`${x.name} ${x.lang}`) && x.lang.startsWith(lang.slice(0, 2)))
        if (v) u.voice = v
      }
      u.onstart = began
      u.onend = resolve
      u.onerror = resolve
      speechSynthesis.speak(u)
    })
  }

  async function speakNeural(text) {
    // Neural voice sounds unnatural above 1.2× speed; clamp it here so a
    // user-set rate of 1.3 does not produce chipmunk speech.
    const neuralRate = Math.min(rate, 1.2)
    const { pcm, sampleRate } = await synth(text, { voice, speed: neuralRate })
    if (cancelled || !pcm?.length) return
    const ac = ctx()
    const buffer = ac.createBuffer(1, pcm.length, sampleRate)
    buffer.copyToChannel(pcm, 0)
    await new Promise((resolve) => {
      const src = ac.createBufferSource()
      src.buffer = buffer
      src.connect(ac.destination)
      src.onended = () => { current = null; resolve() }
      current = src
      began()
      src.start()
    })
  }

  return {
    /** Queue a clause. Order is preserved; overlapping speech is never allowed. */
    speak(text) {
      const line = String(text ?? '').trim()
      if (!line || cancelled) return
      queue.push(line)
      if (!pumping) {
        pumping = true
        void (async () => {
          while (queue.length && !cancelled) {
            const next = queue.shift()
            if (!next) continue
            try {
              if (engine === 'neural' && await waitForNeural()) {
                if (cancelled) break
                try {
                  await speakNeural(next)
                } catch {
                  await speakSystem(next)
                }
              } else {
                await speakSystem(next)
              }
            } finally {
              if (!cancelled && queue.length === 0 && speaking) {
                speaking = false
                onEnd()
              }
            }
          }
          pumping = false
        })().catch(() => { pumping = false })
      }
    },

    /** Barge-in: stop mid-word and drop everything still queued. */
    cancel() {
      cancelled = true
      try { speechSynthesis.cancel() } catch { /* not started */ }
      try { current?.stop() } catch { /* already finished */ }
      current = null
      queue = []
      if (speaking) { speaking = false; onEnd() }
      cancelled = false
      return Promise.resolve()
    },

    close() {
      cancelled = true
      try { speechSynthesis.cancel() } catch { /* not started */ }
      try { current?.stop() } catch { /* already finished */ }
      audioCtx?.close().catch(() => {})
      audioCtx = null
    },

    /** Update voice/lang/rate (and engine) on the shared speaker without
     *  recreating it — otherwise a male/female change never took effect. */
    configure(opts = {}) {
      if (opts.voice != null) voice = opts.voice
      if (opts.lang != null) lang = opts.lang
      if (opts.rate != null) rate = opts.rate
      if (opts.onEnd) onEnd = opts.onEnd
      if (opts.engine && opts.engine !== engine) {
        engine = opts.engine
        if (engine === 'neural' && !neuralReady && !ready) {
          ready = preload()
            .then(() => { neuralReady = true; onEngine('neural'); return true })
            .catch(() => { onEngine('system'); return false })
        }
      }
    },

    get speaking() { return speaking },
    get usingNeural() { return engine === 'neural' && neuralReady },
  }
}

/**
 * One speaker for everything outside a call — the play button on a message and
 * the `tts` tool. Shared so a second click stops the first, rather than two
 * voices talking over each other.
 */
let shared = null
export function getSharedSpeaker(opts = {}) {
  if (!shared) shared = createSpeaker({ engine: 'neural', ...opts })
  else shared.configure(opts)   // apply the latest voice/lang/rate/engine choice
  return shared
}
export function stopSharedSpeaker() {
  shared?.cancel()
}

/** Recognition and the system voice should follow the browser, not the code. */
export function defaultLang() {
  if (typeof navigator === 'undefined') return 'en-US'
  const l = navigator.language || 'en-US'
  return /-/.test(l) ? l : `${l}-${l.toUpperCase()}`
}