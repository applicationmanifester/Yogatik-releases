/**
 * Everything the companion actually DOES, in one place.
 *
 * FloatingCompanion was a 1300-line HUD wired to nothing: `autoWatch` and
 * `ambient` were React state with no loop behind them, companionAwareness's
 * shouldObserve/shouldSpeak/contextChanged/buildObservationPrompt were imported
 * and never called, and every message it sent went to whatever chat happened to
 * be open in the main window. The switches lit up; nothing watched, nothing
 * thought, and the companion had no memory of its own.
 *
 * This hook is the missing half:
 *   - its own conversation                        (companionChat + runtime)
 *   - a continuous, cheap, budgeted watch loop    (liveWatch → watch + adaptive)
 *   - vision for models that cannot see           (on-device OCR / VLM)
 *   - a speak gate so it interrupts rarely        (companionAwareness)
 *   - voice in and out                            (live/cascade + live/voice)
 *
 * The heavy modules are imported lazily and only when a capability is switched
 * on: a docked companion that has never been asked to watch or speak must not
 * pull Tesseract, a VLM or a 90MB narrator into the first paint.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { askCompanion, subscribeCompanion, getCompanionHistory, stopCompanion, hydrateCompanion } from './runtime'
import { createLiveWatcher, STATUS } from './liveWatch'
import { shouldSpeak, SPEAK_COOLDOWN_MS } from '../companionAwareness'
import { createCaptureController, captureCapabilities, describeCapabilities, SOURCE } from './capture'
import { createTrail } from './trail'
import { PERSONAS } from './companionChat'

const EMPTY_STATUS = {
  state: STATUS.IDLE,
  reason: '',
  cadence: '',
  budgetLeft: null,
  budgetMax: null,
  looks: 0,
  skipped: 0,
}

export function useCompanionBrain({
  provider,
  model,
  surface = 'panel',
  /** 'ask' confirms before acting; 'auto' only stops at the irreversible rail. */
  mode = 'ask',
  defaultPersona = 'pair',
  onSpeakText,
} = {}) {
  const [messages, setMessages] = useState(() => getCompanionHistory())
  const [streamText, setStreamText] = useState('')
  const [busy, setBusy] = useState(false)
  const [watching, setWatching] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [watchStatus, setWatchStatus] = useState(EMPTY_STATUS)
  const [lastFrame, setLastFrame] = useState(null)
  const [error, setError] = useState(null)
  const [steps, setSteps] = useState([])
  const [trailEntries, setTrailEntries] = useState([])
  const [persona, setPersona] = useState(defaultPersona)

  const watcherRef = useRef(null)
  const speakRef = useRef({ lastSpokeAt: 0, spokenCount: 0 })
  const canSeeRef = useRef(null)      // tri-state: null = not probed yet
  const typingRef = useRef(false)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const personaRef = useRef(persona)
  personaRef.current = persona

  // One capture controller for the life of the hook. Rebuilding it would drop
  // the live MediaStream and silently end a screen share the user had granted.
  const captureRef = useRef(null)
  const trailRef = useRef(null)
  if (!trailRef.current) trailRef.current = createTrail()
  if (!captureRef.current && typeof window !== 'undefined') {
    captureRef.current = createCaptureController({
      onEnded: (source) => {
        // The browser's own "Stop sharing" bar lives outside the page. Without
        // this the toggle stays lit over a dead track and the companion just
        // never sees anything again — a silent dead switch.
        if (source === SOURCE.SCREEN) {
          watcherRef.current?.stop()
          setWatching(false)
          trailRef.current.source('You stopped sharing your screen.')
        } else {
          setCameraOn(false)
          trailRef.current.source('The camera was turned off.')
        }
      },
    })
  }

  const capabilities = useMemo(() => captureCapabilities(), [])

  useEffect(() => trailRef.current.subscribe(setTrailEntries), [])

  // ── the companion's own transcript ─────────────────────────────────────────
  useEffect(() => subscribeCompanion((e) => {
    if (e.type === 'user') { setMessages(getCompanionHistory()); setStreamText(''); setBusy(true); setSteps([]) }
    else if (e.type === 'token') setStreamText(e.text)
    else if (e.type === 'reply') { setMessages(getCompanionHistory()); setStreamText(''); setBusy(false) }
    else if (e.type === 'silent') { setStreamText(''); setBusy(false) }
    else if (e.type === 'hydrated') setMessages(getCompanionHistory())
    else if (e.type === 'error') { setError(e.error); setStreamText(''); setBusy(false); trailRef.current.error(e.error) }
    else if (e.type === 'tools') {
      const names = (Array.isArray(e.calls) ? e.calls : [])
        .map(c => c?.function?.name || c?.name).filter(Boolean)
      if (names.length) setSteps(s => [...s, ...names.map(n => ({ id: `${n}:${Date.now()}:${Math.random()}`, name: n, status: 'running' }))])
    } else if (e.type === 'tool-result') {
      const name = e.result?.tool || e.result?.name
      setSteps(s => s.map(x => (x.name === name && x.status === 'running')
        ? { ...x, status: e.result?.success === false ? 'failed' : 'done' }
        : x))
    }
  }), [])

  // Last session's turns, so a reload does not produce a companion with
  // amnesia sitting on top of a database full of its own conversation.
  useEffect(() => { hydrateCompanion().catch(() => {}) }, [])

  /** Ask the companion, in its own chat. */
  const ask = useCallback(async (text, image = null, opts = {}) => {
    setError(null)
    return askCompanion({
      text, image, provider, model, surface,
      watching: !!watcherRef.current?.isRunning(),
      canAct: modeRef.current === 'auto' || opts.tools,
      persona: opts.persona || personaRef.current,
      ...opts,
    })
  }, [provider, model, surface])

  // ── vision: does the active model take images at all? ──────────────────────
  const describeFrame = useCallback(async (dataUrl, question) => {
    if (canSeeRef.current === null) {
      try {
        const api = await import('../api')
        const status = await api.getVisionStatus(provider, model)
        canSeeRef.current = !!(status.cached ?? status.guessed)
      } catch { canSeeRef.current = false }
    }
    if (canSeeRef.current) return { image: dataUrl, note: null }
    // A blind model is told what is on screen rather than being handed a frame
    // it will hallucinate about — the same three-tier policy the camera uses.
    try {
      const { describeWithoutModel } = await import('../vision/source')
      const described = await describeWithoutModel(dataUrl, question)
      return { image: null, note: described?.text ? `[Screen, read on-device: ${described.text}]` : null }
    } catch {
      return { image: null, note: '[A frame was captured but could not be read on this device.]' }
    }
  }, [provider, model])

  // ── the watch loop ─────────────────────────────────────────────────────────
  const buildWatcher = useCallback(() => createLiveWatcher({
    // ONE capture path for every surface. The desktop bridge and getDisplayMedia
    // are both behind capture.js, which is why the floating window can now watch
    // a shared tab in a browser instead of insisting it is desktop-only.
    capture: async () => captureRef.current?.grab(SOURCE.SCREEN) ?? null,
    hash: async (dataUrl) => {
      const { hashDataUrl } = await import('./screenHash')
      return hashDataUrl(dataUrl)
    },
    onStatus: (s) => {
      setWatchStatus(s)
      // Every skipped round leaves a receipt. "Working and quiet" and "broken
      // and quiet" are indistinguishable from outside, and users resolve that
      // ambiguity by switching the feature off.
      //
      // liveWatch has no SKIPPED state — a round it declines returns to
      // WATCHING carrying the reason — so that is what a skip looks like here.
      // The trail collapses consecutive identical reasons, which is what keeps
      // an idle desktop from filling the buffer with one repeated line.
      if (s?.state === STATUS.WATCHING && s.reason) trailRef.current.skip(s.reason)
      else if (s?.state === STATUS.BLOCKED && s.reason) trailRef.current.error(s.reason)
    },
    onLook: async ({ dataUrl, reason }) => {
      setLastFrame(dataUrl)
      trailRef.current.look({ reason })
      const now = Date.now()
      const s = speakRef.current
      // Noticing is cheap and frequent; SAYING something has to be earned.
      // Without this the companion narrates every window switch and gets
      // closed within the hour.
      const allowed = shouldSpeak({
        changed: true,
        settledMs: Infinity,          // liveWatch already waited out the interval
        streaming: busy,
        userTyping: typingRef.current,
        now,
        lastSpokeAt: s.lastSpokeAt,
        spokenCount: s.spokenCount,
      })
      if (!allowed) {
        trailRef.current.quiet('too soon after the last time it spoke')
        return { skipped: 'speak gate' }
      }

      const { image, note } = await describeFrame(dataUrl, 'What changed and is anything wrong?')
      const result = await ask(
        [
          `[Ambient check] The shared screen changed (${reason}).`,
          note || '',
          'If there is something genuinely useful to say — an error, a risk, a next step — say it in one sentence. Otherwise reply NOTHING-TO-ADD.',
        ].filter(Boolean).join('\n'),
        image,
        { ambient: true, tools: false },
      )
      if (result?.answer) {
        s.lastSpokeAt = Date.now()
        s.spokenCount += 1
        trailRef.current.spoke(result.answer)
        onSpeakText?.(result.answer)
      } else if (result?.silent) {
        trailRef.current.quiet('nothing had changed that mattered')
      }
      return result
    },
  }), [ask, busy, describeFrame, onSpeakText])

  const startWatch = useCallback(async () => {
    if (watcherRef.current?.isRunning()) return true
    // Acquire the source BEFORE claiming to watch. getDisplayMedia needs a user
    // gesture, and a toggle that flips on and then silently never looks is the
    // failure this whole module exists to remove.
    const res = await captureRef.current?.start(SOURCE.SCREEN)
    if (!res?.ok) {
      setError(res?.error || 'Could not start watching.')
      trailRef.current.error(res?.error || 'Could not start watching.')
      return false
    }
    watcherRef.current = watcherRef.current || buildWatcher()
    watcherRef.current.start()
    setWatching(true)
    trailRef.current.source(res.mode === 'native' ? 'Watching this computer’s screen.' : 'Watching the window you shared.')
    return true
  }, [buildWatcher])

  const stopWatch = useCallback(() => {
    const watcher = watcherRef.current
    watcher?.stop()
    captureRef.current?.stop(SOURCE.SCREEN)
    trailRef.current.source('Stopped watching.')

    // If a round is mid-flight, defer the UI badge flip until it resolves.
    // This prevents isRunning()===true while watching===false, which caused
    // the "modal still running but UI showed stopped" symptom.
    if (watcher?.isInFlight()) {
      const poll = setInterval(() => {
        if (!watcher.isInFlight()) {
          clearInterval(poll)
          setWatching(false)
        }
      }, 100)
      // Safety cap: flip after 10s regardless (handles a permanently-hung round).
      setTimeout(() => { clearInterval(poll); setWatching(false) }, 10_000)
    } else {
      setWatching(false)
    }
  }, [])

  /* ── camera ───────────────────────────────────────────────────────────── */

  const startCamera = useCallback(async () => {
    const res = await captureRef.current?.start(SOURCE.CAMERA)
    if (!res?.ok) { setError(res?.error || 'Could not start the camera.'); return false }
    setCameraOn(true)
    trailRef.current.source('Camera on.')
    return true
  }, [])

  const stopCamera = useCallback(() => {
    captureRef.current?.stop(SOURCE.CAMERA)
    setCameraOn(false)
    trailRef.current.source('Camera off.')
  }, [])

  /** Look through the camera right now and answer about it. */
  const askAboutCamera = useCallback(async (question = 'What do you see?') => {
    const frame = await captureRef.current?.grab(SOURCE.CAMERA)
    if (!frame) { setError('No camera frame available.'); return null }
    setLastFrame(frame)
    const { image, note } = await describeFrame(frame, question)
    return ask([question, note || ''].filter(Boolean).join('\n'), image, { tools: false })
  }, [ask, describeFrame])

  /** One look right now, and say something about it whatever the gates think. */
  const lookNow = useCallback(async () => {
    if (!watcherRef.current) watcherRef.current = buildWatcher()
    // A deliberate press is not an ambient glance: reset the cooldown so the
    // speak gate cannot swallow the answer the user just asked for.
    speakRef.current.lastSpokeAt = Date.now() - SPEAK_COOLDOWN_MS - 1
    return watcherRef.current.look()
  }, [buildWatcher])

  /** Tell the loop the user is mid-thought, so it does not talk over them. */
  const setTyping = useCallback((v) => {
    typingRef.current = !!v
    watcherRef.current?.setEngaged(!!v)
  }, [])

  useEffect(() => () => {
    watcherRef.current?.stop()
    // Every track released on unmount. A screen share left running after the
    // companion closes keeps the browser's sharing indicator up, which reads
    // as the app still watching after it was dismissed.
    captureRef.current?.stopAll()
    stopCompanion()
  }, [])

  const summary = useMemo(() => {
    if (!watching && !cameraOn) return describeCapabilities(capabilities, { watching: false, camera: false })
    const { budgetLeft, budgetMax, cadence, reason } = watchStatus
    const what = describeCapabilities(capabilities, { watching, camera: cameraOn })
    if (!watching) return what
    const budget = budgetLeft == null ? '' : ` · ${budgetLeft}/${budgetMax} looks left`
    return `${what} ${cadence}${budget}${reason ? ` · ${reason}` : ''}`
  }, [watching, cameraOn, watchStatus, capabilities])
  /* ── quick workspace actions ─────────────────────────────────────────── */
  const reviewGitDiff = useCallback(async () => {
    try {
      let diff = ''
      if (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__?.gitDiff) {
        diff = await window.__YOGATIK_DESKTOP__.gitDiff()
      }
      const prompt = diff
        ? `Please review my current git diff and highlight any risks, missing edge cases, or potential regressions:\n\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\``
        : 'Please review recent changes across the workspace, summarize git status, and suggest logical next steps.'
      return ask(prompt, null, { tools: true })
    } catch {
      return ask('Please review git status and recent code modifications in my workspace.', null, { tools: true })
    }
  }, [ask])

  const scanTerminalErrors = useCallback(async () => {
    try {
      const { getErrorLogs } = await import('../errorLog').catch(() => ({}))
      const logs = typeof getErrorLogs === 'function' ? getErrorLogs().slice(-5) : []
      const prompt = logs.length
        ? `Diagnose these recent application / terminal errors and suggest concrete, concise fixes:\n${logs.map(l => `[${l.level || 'ERROR'}] ${l.message}`).join('\n')}`
        : 'Please scan terminal output and application state for active errors or failed steps and propose fixes.'
      return ask(prompt, null, { tools: true })
    } catch {
      return ask('Please check workspace and terminal diagnostics for active errors.', null, { tools: true })
    }
  }, [ask])

  const explainActiveFile = useCallback(async ({ filename = 'active file', content = '' } = {}) => {
    const prompt = content
      ? `Explain the architectural role, structure, and potential gotchas of \`${filename}\`:\n\`\`\`\n${content.slice(0, 2500)}\n\`\`\``
      : `Please explain the active file \`${filename}\` and summarize its core responsibility.`
    return ask(prompt, null, { tools: true })
  }, [ask])

  const suggestTests = useCallback(async ({ filename = 'active file', content = '' } = {}) => {
    const prompt = content
      ? `Generate focused unit tests and edge cases for \`${filename}\`:\n\`\`\`\n${content.slice(0, 2500)}\n\`\`\``
      : `Suggest key unit tests and assertions for \`${filename}\`.`
    return ask(prompt, null, { tools: true })
  }, [ask])

  const quickActions = useMemo(() => ({
    reviewGitDiff,
    scanTerminalErrors,
    explainActiveFile,
    suggestTests,
  }), [reviewGitDiff, scanTerminalErrors, explainActiveFile, suggestTests])

  return {
    messages, streamText, busy, error, steps,
    ask, stop: stopCompanion,
    watching, startWatch, stopWatch, lookNow, watchStatus, summary,
    cameraOn, startCamera, stopCamera, askAboutCamera,
    capabilities,
    persona, setPersona, PERSONAS,
    quickActions,
    trail: trailEntries,
    clearTrail: () => trailRef.current.clear(),
    lastFrame, setTyping,
  }
}
