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
import { askCompanion, subscribeCompanion, getCompanionHistory, stopCompanion } from './runtime'
import { createLiveWatcher, STATUS } from './liveWatch'
import { shouldSpeak, SPEAK_COOLDOWN_MS } from '../companionAwareness'

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
  /** Desktop exposes a real screen grabber; the web uses getDisplayMedia. */
  captureScreen,
  onSpeakText,
} = {}) {
  const [messages, setMessages] = useState(() => getCompanionHistory())
  const [streamText, setStreamText] = useState('')
  const [busy, setBusy] = useState(false)
  const [watching, setWatching] = useState(false)
  const [watchStatus, setWatchStatus] = useState(EMPTY_STATUS)
  const [lastFrame, setLastFrame] = useState(null)
  const [error, setError] = useState(null)

  const watcherRef = useRef(null)
  const speakRef = useRef({ lastSpokeAt: 0, spokenCount: 0 })
  const canSeeRef = useRef(null)      // tri-state: null = not probed yet
  const typingRef = useRef(false)

  // ── the companion's own transcript ─────────────────────────────────────────
  useEffect(() => subscribeCompanion((e) => {
    if (e.type === 'user') { setMessages(getCompanionHistory()); setStreamText(''); setBusy(true) }
    else if (e.type === 'token') setStreamText(e.text)
    else if (e.type === 'reply') { setMessages(getCompanionHistory()); setStreamText(''); setBusy(false) }
    else if (e.type === 'silent') { setStreamText(''); setBusy(false) }
    else if (e.type === 'error') { setError(e.error); setStreamText(''); setBusy(false) }
  }), [])

  /** Ask the companion, in its own chat. */
  const ask = useCallback(async (text, image = null, opts = {}) => {
    setError(null)
    return askCompanion({
      text, image, provider, model, surface,
      watching: !!watcherRef.current?.isRunning(),
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
    capture: async () => {
      try {
        if (captureScreen) return await captureScreen()
        const { captureWebScreenFrame } = await import('../pipCompanion')
        const frame = await captureWebScreenFrame()
        return frame?.dataUrl || null
      } catch { return null }
    },
    hash: async (dataUrl) => {
      const { hashDataUrl } = await import('./screenHash')
      return hashDataUrl(dataUrl)
    },
    onStatus: setWatchStatus,
    onLook: async ({ dataUrl, reason }) => {
      setLastFrame(dataUrl)
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
      if (!allowed) return { skipped: 'speak gate' }

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
        onSpeakText?.(result.answer)
      }
      return result
    },
  }), [ask, busy, captureScreen, describeFrame, onSpeakText])

  const startWatch = useCallback(async () => {
    if (watcherRef.current?.isRunning()) return true
    // Ask for the screen BEFORE claiming to watch: getDisplayMedia needs a user
    // gesture, and a toggle that flips on and then silently never looks is the
    // failure this whole module exists to remove.
    if (!captureScreen) {
      try {
        const { requestWebScreenStream } = await import('../pipCompanion')
        await requestWebScreenStream()
      } catch (e) {
        setError(e?.message || 'Screen sharing was declined.')
        return false
      }
    }
    watcherRef.current = watcherRef.current || buildWatcher()
    watcherRef.current.start()
    setWatching(true)
    return true
  }, [buildWatcher, captureScreen])

  const stopWatch = useCallback(() => {
    watcherRef.current?.stop()
    setWatching(false)
    import('../pipCompanion').then(m => m.stopWebScreenStream?.()).catch(() => {})
  }, [])

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
    stopCompanion()
  }, [])

  const summary = useMemo(() => {
    if (!watching) return 'Not watching'
    const { budgetLeft, budgetMax, cadence, reason } = watchStatus
    const budget = budgetLeft == null ? '' : ` · ${budgetLeft}/${budgetMax} looks left`
    return `Watching ${cadence}${budget}${reason ? ` · ${reason}` : ''}`
  }, [watching, watchStatus])

  return {
    messages, streamText, busy, error,
    ask, stop: stopCompanion,
    watching, startWatch, stopWatch, lookNow, watchStatus, summary,
    lastFrame, setTyping,
  }
}
