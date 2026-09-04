import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench,
  AlertTriangle, Monitor, MonitorOff, MessageSquare, Eye, EyeOff,
  Aperture, Volume2, VolumeX, Scan, ScanEye,
  RefreshCw, SwitchCamera, Settings2,
} from 'lucide-react'
import { runAgent } from '../agent'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'
import { formatLiveSessionRecap } from '../live/sessionHandoff'
import { captureProfile, describeWithoutModel, getSharedVisualSource } from '../vision/source'
import { detectObjects } from '../vision/detect'
import { buzz } from '../features'
import { VisionModal } from './VisionModal'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'
import { LiveDevicePicker } from './LiveDevicePicker'
import { LiveSettings } from './LiveSettings'
import { enumerate, canFlipCamera } from '../live/devices'
import * as liveMetrics from '../live/metrics'

/**
 * Full-screen face-to-face call with:
 * - Multi-ring animated orb that reacts to audio levels
 * - Screen sharing support
 * - Slide-out transcript sidebar with full conversation history
 * - Visual awareness indicators (provider, model, watching status)
 * - Thinking state shimmer between user speech and first token
 * - Mobile-optimized layout
 */
export function LiveView({
  engine = 'gemini', provider, apiKey, model, voice, voiceEngine, fallbacks,
  persona, disabledTools, modelCanSee, onEnd, onTranscript, features = {},
  availableModels = [], onModelChange,
}) {
  // Consolidated UI state to reduce re-renders
  const [uiState, setUiState] = useState({
    state: 'connecting',
    error: '',
    muted: false,
    // AI voice OUTPUT, separate from `muted` (the mic). Previously there was
    // no way to turn the assistant's speaking off without also turning off
    // listening.
    speakerMuted: false,
    camOn: true,
    screenOn: false,
    // 'auto' = look when asked / on scene change; 'always' = watch every turn
    // (works for ANY model — non-vision models are described on-device).
    // Default persists via the liveWatchAlways preference (Personalise panel).
    visionMode: features.liveWatchAlways ? 'always' : 'auto',
    speaking: false,
    thinking: false,
    tool: null,
    lines: [],
    transcript: [],    // full history
    showTranscript: false,
    copiedIdx: -1,
    frameSent: false,
    liveVoice: voiceEngine === 'neural' ? 'loading' : 'system',
    activeProvider: { provider, model },
    connectionState: 'connecting', // connecting | negotiating | ready | reconnecting | failed
    userLevel: 0,
    assistantLevel: 0,
    breathingPhase: 0,
  })

  // Vision Modal State
  const [visionState, setVisionState] = useState({
    open: false,
    image: null,
    text: '',
    loading: false,
    q: '',
    via: '',
    autoScan: features.autoScan === true,
    retakeFlash: false,
    // Local, on-screen HUD only — boxes are drawn client-side from the SAME
    // shared camera/screen source everything else here already reads, never
    // turned into a turn or sent to the model. Off by default: it is a real
    // on-device model (DETR, ~40MB) plus continuous inference for as long as
    // it runs, so it must be an explicit ask, not a standing cost.
    objectDetect: features.liveObjectDetection === true,
    detections: [],
    detectError: '',
  })

  // Which camera/mic the call is actually using, and whether a front/back
  // flip is even meaningful here — two REAR cameras (a phone's wide and
  // telephoto) are a choice, not a flip, and offering one there looks broken.
  const [deviceIds, setDeviceIds] = useState({ cameraId: '', micId: '' })
  const [showDevices, setShowDevices] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Live-only overrides so a change applies to THIS call immediately; the
  // Personalise panel still owns the persisted default.
  const [liveRate, setLiveRate] = useState(1)
  const [liveVoiceId, setLiveVoiceId] = useState(voice || '')
  const [liveEngine, setLiveEngine] = useState(voiceEngine || 'neural')
  const [showCaptions, setShowCaptions] = useState(features.liveCaptions !== false)
  const [hasFlip, setHasFlip] = useState(false)

  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const turnRef = useRef({ role: null, text: '' })
  const transcriptEndRef = useRef(null)
  const frameTimerRef = useRef(null)

  // Destructure for convenience in render
  const {
    state, error, muted, speakerMuted, camOn, screenOn, visionMode, speaking, thinking, tool,
    lines, transcript, showTranscript, copiedIdx, frameSent, liveVoice,
    activeProvider, connectionState, userLevel, assistantLevel, breathingPhase,
  } = uiState

  const {
    visionOpen, visionImage, visionText, visionLoading, visionQ, visionVia,
    autoScan, retakeFlash, objectDetect, detections, detectError,
  } = visionState

  const setState = (updater) => setUiState(prev => ({
    ...prev,
    ...(typeof updater === 'function' ? updater(prev) : updater)
  }))
  const setVision = (updater) => setVisionState(prev => ({
    ...prev,
    ...(typeof updater === 'function' ? updater(prev) : updater)
  }))

  /**
   * Transcript deltas arrive fragmented; merge into the current speaker's line.
   *
   * "Merge while the role is the same" is not enough on its own: two CONSECUTIVE
   * assistant turns then concatenate with no boundary, which is where
   * "you have got ityou have got it" came from — one reply glued onto the
   * previous one. Tokens inside a single streamed answer arrive continuously,
   * so a gap of more than a second means a new turn started; that is the
   * boundary, and it works on both engines without a protocol change.
   */
  const lastDeltaAtRef = useRef(0)
  const TURN_GAP_MS = 1200

  const pushDelta = useCallback((role, text) => {
    const now = Date.now()
    const newTurn = now - lastDeltaAtRef.current > TURN_GAP_MS
    lastDeltaAtRef.current = now

    // Captions: only the last few, and never more than 3 on screen — this sits
    // over live video, and a six-line wall of text is unreadable on a phone.
    setState((prev) => {
      const lines = [...prev.lines]
      const last = lines[lines.length - 1]
      if (last && last.role === role && !newTurn) {
        lines[lines.length - 1] = { role, text: last.text + text }
      } else {
        lines.push({ role, text })
      }
      return { ...prev, lines: lines.slice(-3) }
    })
    // Full transcript
    setState((prev) => {
      const transcript = [...prev.transcript]
      const last = transcript[transcript.length - 1]
      if (last && last.role === role && last.type === 'message' && !newTurn) {
        transcript[transcript.length - 1] = { ...last, text: last.text + text, time: Date.now(), streaming: true }
      } else {
        transcript.push({ role, text, type: 'message', time: Date.now(), streaming: true })
      }
      return { ...prev, transcript }
    })
    const t = turnRef.current
    if (t.role === role) t.text += text
    else {
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      turnRef.current = { role, text }
    }
  }, [onTranscript])

  // Keyboard handling for vision modal
  useEffect(() => {
    if (!visionState.open) return
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setVision({ open: false }) }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askVision(visionState.q) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visionState.open, visionState.q])

  // Is a front/back flip meaningful on this device? Asked once the camera is
  // on, because device LABELS are blank until permission has been granted —
  // before that every camera looks the same and canFlipCamera cannot tell.
  useEffect(() => {
    if (!camOn) { setHasFlip(false); return undefined }
    let alive = true
    enumerate()
      .then(({ cameras }) => { if (alive) setHasFlip(canFlipCamera(cameras)) })
      .catch(() => {})
    return () => { alive = false }
  }, [camOn])

  // Breathing animation when idle
  useEffect(() => {
    if (!speaking && !thinking && state === 'live') {
      const id = setInterval(() => setState({ breathingPhase: (prev => (prev + 0.02) % (Math.PI * 2)) }), 50)
      return () => clearInterval(id)
    }
  }, [speaking, thinking, state])

  useEffect(() => {
    setState({
      state: 'connecting',
      error: '',
      tool: null,
      thinking: false,
      speaking: false,
      connectionState: 'connecting',
      userLevel: 0,
      assistantLevel: 0,
    })

    let cancelled = false
    // One session record per mounted call. Local only — timings and counts,
    // never content: those are the numbers that decide what to build next and
    // the ones that carry no privacy cost.
    liveMetrics.startSession({ engine, provider, modelCanSee })
    const make = engine === 'gemini' ? createLiveSession : createCascadeSession
    const session = make({
      provider, apiKey, model, voice, voiceEngine, fallbacks,
      persona, disabledTools, modelCanSee, camera: true,
      visionMode: features.liveWatchAlways ? 'always' : 'auto',
      onEvent: (e) => {
        if (cancelled) return
        switch (e.type) {
          case 'connected':
            setState({ connectionState: 'negotiating' })
            break
          case 'ready':
            setState({ connectionState: 'ready', state: 'live' })
            break
          case 'camera':
            if (videoRef.current) videoRef.current.srcObject = e.stream
            break
          case 'screen':
            setState({ screenOn: e.active ?? !!e.stream })
            break
          case 'level':
            if (e.who === 'user') setState({ userLevel: e.value })
            else setState({ assistantLevel: e.value })
            break
          case 'speaking': setState({ speaking: e.value }); break
          case 'thinking': setState({ thinking: e.value }); break
          case 'transcript': pushDelta(e.role, e.text); break
          case 'tools':
            // Use functional form so we always append to the *current* transcript,
            // not the stale snapshot captured when the effect was created.
            setState(prev => ({
              ...prev,
              tool: e.names.join(', '),
              transcript: [...prev.transcript, { type: 'tool', name: e.names.join(', '), time: Date.now() }],
            }))
            break
          case 'toolResult': {
            // Keep the raw result object so images/videos/files/code render richly.
            const r = e.result
            setState(prev => ({
              ...prev,
              tool: null,
              transcript: [...prev.transcript, { type: 'toolResult', name: e.name, time: Date.now(), result: r }],
              // Surface generated media: open the panel so the user sees it.
              showTranscript: prev.showTranscript || !!(r && typeof r === 'object' &&
                (r.image_url || r.url || r.video_url || r.media_id || r.audio_url || r.exported_text || r.images)),
            }))
            break
          }
          case 'voice': setState({ liveVoice: e.engine }); break
          case 'provider': setState({ activeProvider: { provider: e.provider, model: e.model } }); break
          case 'reconnecting':
            setState({ connectionState: 'reconnecting', state: 'connecting' })
            break
          case 'error':
            liveMetrics.endSession(liveMetrics.END_REASON.ERROR)
            setState({ error: e.message, state: 'error', connectionState: 'failed' })
            break
          case 'ended': setState({ state: 'ended' }); break
          default: break
        }
      },
    })
    sessionRef.current = session
    session.start().catch((err) => {
      if (cancelled) return
      setState({
        error: err?.name === 'NotAllowedError'
          ? 'Microphone and camera access were blocked. Allow them in your browser, then try again.'
          : err?.message || String(err),
        state: 'error',
      })
    })

    return () => {
      cancelled = true
      const t = turnRef.current
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      // A no-op if the session was already ended by handleEnd or by an error.
      // Reaching here with a session still open means the user navigated away
      // mid-call — a silent ending, and the one most likely to mean the thing
      // was not working.
      liveMetrics.endSession(liveMetrics.END_REASON.UNMOUNT)
      session.stop()
    }
  }, [provider, model, apiKey, voice, voiceEngine, engine])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Frame-sent blink indicator
  useEffect(() => {
    if (camOn || screenOn) {
      frameTimerRef.current = setInterval(() => {
        setState({ frameSent: true })
        setTimeout(() => setState({ frameSent: false }), 200)
      }, 1000)
    }
    return () => clearInterval(frameTimerRef.current)
  }, [camOn, screenOn])

  // Periodic Auto-Scan vision timer
  useEffect(() => {
    let timer = null
    if (visionState.autoScan && (camOn || screenOn) && state === 'live') {
      timer = setInterval(() => {
        // The session grabs its own frame: it owns the stream, applies the
        // capture profile, and skips frames identical to the last one.
        sessionRef.current?.watch?.()
      }, 10000)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [visionState.autoScan, camOn, screenOn, state])

  /**
   * Live object-detection overlay. Deliberately separate from Auto-Scan and
   * from `sessionRef.current?.watch()`: those feed a frame to the MODEL as a
   * conversation turn, which costs a round trip and tokens every time. This
   * is a local HUD — it reads the SAME shared camera/screen source (one
   * camera, one consumer set, per vision/source.js's own rule) but the boxes
   * never leave the browser.
   *
   * `src.grab(false, ...)` reuses the aHash change-gate video.js already has:
   * a still scene returns null and DETR is simply not run that tick, which is
   * the same "compression" discipline the capture pipeline already applies
   * everywhere else (see the video/image capture note above) — the cheapest
   * frame is the one you never send to the model.
   */
  useEffect(() => {
    if (!objectDetect || !(camOn || screenOn) || state !== 'live') {
      // Never leave a stale box on screen describing a frame that is no
      // longer being shown (camera off, screen share ended, toggle turned
      // off) — a HUD that lies about what is currently in frame is worse
      // than no HUD.
      setVision(v => (v.detections.length ? { detections: [] } : v))
      return
    }
    let cancelled = false
    let inFlight = false
    const tick = async () => {
      if (cancelled || inFlight) return
      const src = getSharedVisualSource()
      if (!src || src.stopped) return
      const frame = src.grab(false, { maxEdge: 480, quality: 0.6 })
      if (!frame) return
      inFlight = true
      try {
        const objects = await detectObjects(`data:image/jpeg;base64,${frame}`, { threshold: 0.6 })
        if (!cancelled) setVision({ detections: objects, detectError: '' })
      } catch (err) {
        // Most likely: the user turned this on without also turning on
        // "On-device vision" (the shared download consent — see App.jsx).
        // Say why and turn the toggle back off rather than retrying forever
        // against a model that will never load.
        if (!cancelled) setVision({ objectDetect: false, detections: [], detectError: err?.message || String(err) })
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(tick, 1200)
    tick()
    return () => { cancelled = true; clearInterval(timer) }
  }, [objectDetect, camOn, screenOn, state])

  const toggleMute = () => {
    const v = !muted
    setState({ muted: v })
    sessionRef.current?.setMuted(v)
    // Haptic on mobile
    buzz(features, 30)
  }
  const toggleSpeaker = () => {
    const v = !speakerMuted
    setState({ speakerMuted: v })
    sessionRef.current?.setSpeakerMuted?.(v)
    buzz(features, 30)
  }
  const toggleCam = async () => {
    const v = !camOn
    // The strategic metric: if camera use is low, Live is a voice app
    // competing on latency, which is the race it cannot win. Recorded as
    // "ever on", not "on now" — the question is whether people reach for it.
    if (v) liveMetrics.markCameraOn()
    setState({ camOn: v })
    await sessionRef.current?.enableCamera(v)
    if (!v && videoRef.current) videoRef.current.srcObject = null
    buzz(features, 30)
  }
  const toggleScreen = async () => {
    const v = !screenOn
    await sessionRef.current?.enableScreenShare(v)
    buzz(features, 30)
  }

  /**
   * Flip front/back. This is the single most-wanted control on a phone — you
   * point the BACK camera at the thing you are asking about — and the camera
   * used to be hardcoded to `facingMode: 'user'` with no way to change it
   * short of ending the call.
   *
   * The track is replaced on the existing stream, so the preview, the aHash
   * change-gate and the `see` tool all keep the same MediaStream.
   */
  const flipCam = async () => {
    if (!camOn) return
    buzz(features, 30)
    const res = await sessionRef.current?.flipCamera?.()
    if (res?.success === false) setState({ error: res.error })
    else if (res?.deviceId) setDeviceIds(d => ({ ...d, cameraId: res.deviceId }))
  }

  const pickDevice = async (kind, deviceId) => {
    const s = sessionRef.current
    const res = kind === 'camera'
      ? await s?.switchCamera?.({ deviceId })
      : await s?.switchMic?.({ deviceId })
    if (res?.success) {
      setDeviceIds(d => ({ ...d, [kind === 'camera' ? 'cameraId' : 'micId']: deviceId }))
      buzz(features, 30)
    }
    return res
  }
  // Toggle continuous watching: 'always' makes ANY model (vision-capable or not)
  // look at the camera/screen every turn; 'auto' looks only when relevant.
  const toggleVision = () => {
    const next = visionMode === 'always' ? 'auto' : 'always'
    setState({ visionMode: next })
    sessionRef.current?.setVisionMode?.(next)
    buzz(features, 30)
  }
  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setState({ copiedIdx: idx })
      setTimeout(() => setState({ copiedIdx: -1 }), 1500)
    })
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  /**
   * Capture from the session's own stream. Going through the session matters:
   * it applies the capture profile (text questions need 1280px, not 768) and
   * never opens a second camera, which fails on phones.
   */
  const captureFrame = (question = '') => {
    const profile = captureProfile(question)
    const fromSession = sessionRef.current?.grabFrame?.(profile)
    if (fromSession) return fromSession
    const v = videoRef.current
    if (!v?.videoWidth) return null
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, profile.maxEdge / Math.max(v.videoWidth, v.videoHeight))
    canvas.width = Math.round(v.videoWidth * scale)
    canvas.height = Math.round(v.videoHeight * scale)
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', profile.quality).split(',')[1]
  }

  const openVision = () => {
    const b64 = captureFrame()
    if (!b64) return
    setVision({ image: b64, text: '', q: '', via: '' })
    setVision({ open: true })
  }

  /**
   * Answer a question about the frame. Same fallback chain as the `see` tool,
   * so the panel works on a model that cannot take images at all.
   */
  const askVision = async (question) => {
    const q = (question || '').trim() ||
      'Describe exactly what you see: the setting, the objects, any people, and any legible text.'
    setVision({ loading: true, text: '' })
    // Re-capture: a "read this label" question needs a sharper frame than the
    // preview shot that opened the panel.
    const b64 = captureFrame(q) || visionImage
    if (b64) setVision({ image: b64 })
    const dataUrl = `data:image/jpeg;base64,${b64}`

    try {
      if (modelCanSee) {
        setVision({ via: model ? model.split('/').pop() : provider })
        await runAgent({
          provider, apiKey, model,
          userMessage: [
            { type: 'text', text: q },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
          toolsEnabled: false,
          onToken: (t) => setVision({ text: visionText + t }),
        })
      } else {
        setVision({ via: 'on-device' })
        const { via, text } = await describeWithoutModel(dataUrl, q)
        setVision({ via: via === 'ocr' ? 'OCR' : 'on-device VLM', text })
      }
    } catch (err) {
      setVision({ text: visionText + `\n\n[Analysis failed: ${err.message}]` })
    } finally {
      setVision({ loading: false })
    }
  }

  /**
   * "Ask out loud" — take the question the user typed into the vision panel and
   * put it into the CALL, so the answer is spoken instead of appearing in a
   * panel they then have to read.
   *
   * This was referenced by the VisionModal and DEFINED NOWHERE: rendering the
   * modal threw `askInCall is not defined`, which is a ReferenceError during
   * render, so the whole app fell into the error boundary. `npm run lint` uses
   * no-undef precisely to catch this — it has caught the same class twice
   * before (PUBLIC_RELAYS, research.js `search`) — so run it before deploying.
   */
  const askInCall = useCallback(() => {
    const q = (visionQ || '').trim()
    if (!q) return
    // sendText returns nothing on either engine, so its return value cannot be
    // used to tell success from a dropped socket. Check the session is there
    // instead — closing the panel when there was nowhere to send would look
    // exactly like it worked.
    const send = sessionRef.current?.sendText
    if (typeof send !== 'function') {
      setVision({ text: `${visionText}\n\n[Could not send: the live session is not connected.]` })
      return
    }
    send(q)
    buzz(features, 30)
    setVision({ open: false })
  }, [visionQ, visionText, features])

  const startTimeRef = useRef(Date.now())

  const handleEnd = useCallback(() => {
    // The reason matters more than the duration. "Hung up after two turns" and
    // "the socket died" are indistinguishable in a length histogram and mean
    // opposite things.
    liveMetrics.endSession(liveMetrics.END_REASON.USER)
    const durationSec = Math.max(1, (Date.now() - startTimeRef.current) / 1000)
    const validTranscripts = (transcript || []).filter(t => t.type === 'message' && t.text)
    const toolsRun = (transcript || []).filter(t => t.type === 'toolResult')
    const recapMarkdown = formatLiveSessionRecap({
      durationSec,
      transcripts: validTranscripts,
      toolsExecuted: toolsRun,
      provider: activeProvider.provider || provider,
      model: activeProvider.model || model,
    })
    onEnd?.({
      durationSec,
      transcripts: validTranscripts,
      toolsExecuted: toolsRun,
      recapMarkdown,
    })
  }, [transcript, activeProvider, provider, model, onEnd])

  // Build capability map for models
  const modelCanSeeMap = useMemo(() => {
    const map = {}
    availableModels?.forEach(m => {
      // Heuristic: vision-capable models often have 'vision', '4o', 'gemini', 'flash' in name
      map[m] = /vision|gemini|4o|flash|pro/i.test(m)
    })
    return map
  }, [availableModels])

  const toolCapableModels = useMemo(() => {
    return availableModels?.filter(m => !/mini|nano|1b|3b|0\.5b/i.test(m)) || []
  }, [availableModels])

  // Orb scale tracks the model's own output level
  const orbScale = useMemo(() => 1 + (speaking ? assistantLevel * 0.45 : 0), [speaking, assistantLevel])
  const ring2Scale = useMemo(() => 1 + (speaking ? assistantLevel * 0.3 : 0), [speaking, assistantLevel])
  const ring3Scale = useMemo(() => 1 + (speaking ? assistantLevel * 0.18 : 0), [speaking, assistantLevel])
  const breathingScale = useMemo(() => 1 + Math.sin(breathingPhase) * 0.02, [breathingPhase])

  return (
    <div className="live-view" role="dialog" aria-modal="true" aria-label="Live conversation">
      <video ref={videoRef} className={`live-self ${camOn ? '' : 'off'}`} autoPlay playsInline muted />
      {/* Object-detection boxes, drawn purely client-side over the self-view.
          `.live-self` is CSS-mirrored (scaleX(-1)) but the captured frame is
          NOT — video.js draws the raw, unmirrored pixels — so x is flipped
          here (1 - xmax) rather than mirroring the whole layer, which would
          also mirror the label text and need a second undo-transform on it. */}
      {objectDetect && detections.length > 0 && (
        <div className="live-detect-layer" aria-hidden="true">
          {detections.map((d, i) => {
            const b = d.box || {}
            const xmin = Math.max(0, Math.min(1, b.xmin ?? 0))
            const xmax = Math.max(0, Math.min(1, b.xmax ?? 0))
            const ymin = Math.max(0, Math.min(1, b.ymin ?? 0))
            const ymax = Math.max(0, Math.min(1, b.ymax ?? 0))
            return (
              <div
                key={i}
                className="live-detect-box"
                style={{
                  left: `${(1 - xmax) * 100}%`,
                  top: `${ymin * 100}%`,
                  width: `${Math.max(0, xmax - xmin) * 100}%`,
                  height: `${Math.max(0, ymax - ymin) * 100}%`,
                }}
              >
                <span className="live-detect-label">
                  {d.label}{d.score ? ` ${Math.round(d.score * 100)}%` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {/* The Identify Pill / Scan Barcode / Enhance Macro shortcut bar (LiveHudOverlay)
          was removed 2026-09-04: it pre-empted the model by capturing the frame and
          acting the instant the button was tapped, whether or not the user had asked
          for that specific job. Saying "identify this pill" (or scan/enhance) out loud
          or in the composer reaches the model through the normal turn — vision is
          already attached per-turn (visualParts/describeIfVisual above) — so nothing
          is lost, it just now requires an actual user command instead of a standing
          button guessing what they want. See buildGuards.test.js's orphan allowlist
          for LiveHudOverlay.jsx. */}

      <LiveSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        modelCanSee={modelCanSee}
        provider={activeProvider.provider || provider}
        model={activeProvider.model || model}
        availableModels={availableModels}
        onModelChange={(m) => { onModelChange?.(m); setShowSettings(false) }}
        visionMode={visionMode}
        onVisionMode={(m) => { setState({ visionMode: m }); sessionRef.current?.setVisionMode?.(m) }}
        voiceEngine={liveEngine}
        onVoiceEngine={(e) => {
          // Gemini fixes the voice at setup and REFUSES this. Only move the
          // control once the engine accepted it, or the UI shows a choice that
          // did not happen.
          const r = sessionRef.current?.setVoiceEngine?.(e)
          if (r?.success === false) setState({ error: r.error })
          else setLiveEngine(e)
        }}
        voice={liveVoiceId}
        onVoice={(v) => {
          const r = sessionRef.current?.setVoice?.(v)
          if (r?.success === false) setState({ error: r.error })
          else setLiveVoiceId(v)
        }}
        rate={liveRate}
        onRate={(r) => { setLiveRate(r); sessionRef.current?.setRate?.(r) }}
        captions={showCaptions}
        onCaptions={setShowCaptions}
      />

      <LiveDevicePicker
        open={showDevices}
        onClose={() => setShowDevices(false)}
        onPick={pickDevice}
        currentCameraId={deviceIds.cameraId}
        currentMicId={deviceIds.micId}
        // Cascade listens through the Web Speech API, which picks the mic
        // itself and accepts no deviceId. Showing a mic list there would be a
        // picker that silently does nothing.
        micSwitchable={engine === 'gemini'}
      />

      {/* Awareness badges — provider/model only; vision status is in the HUD overlay */}
      <div className="live-badges">
        {availableModels && availableModels.length > 0 ? (
          <select
            value={activeProvider.model || model}
            onChange={e => {
              const newModel = e.target.value
              onModelChange?.(newModel)
            }}
            className="live-badge provider select-badge"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              maxHeight: '22px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Change active model"
          >
            {availableModels.map(m => (
              <option key={m} value={m} style={{ background: '#1c1e22', color: '#fff' }}>
                {activeProvider.provider} · {m.split('/').pop()}
              </option>
            ))}
          </select>
        ) : (
          <span className="live-badge provider">
            {activeProvider.provider}
            {activeProvider.model ? ` · ${activeProvider.model.split('/').pop().slice(0, 20)}` : ''}
          </span>
        )}
        {screenOn && <span className="live-badge screen-badge"><Monitor size={12} /> Screen</span>}
      </div>

      {/* Yogatik mascot — reacts to audio level */}
      <div className="live-orb-wrap">
        <div className="live-orb-rings">
          <div
            className={`live-ring ring-3 ${speaking ? 'active' : ''}`}
            style={{ transform: `scale(${ring3Scale})` }}
          />
          <div
            className={`live-ring ring-2 ${speaking ? 'active' : ''}`}
            style={{ transform: `scale(${ring2Scale})` }}
          />
          <div
            className={`live-mascot ${speaking ? 'speaking' : ''} ${state === 'connecting' ? 'pending' : ''} ${thinking ? 'thinking' : ''} ${!speaking && !thinking && state === 'live' ? 'breathing' : ''}`}
            style={{ transform: `scale(${speaking ? orbScale : breathingScale})` }}
          >
            <svg viewBox="0 0 512 512" className="live-mascot-svg" aria-hidden="true">
              {/* Head */}
              <circle cx="256" cy="256" r="110" fill="none" stroke="currentColor" strokeWidth="14" />
              {/* Eyes */}
              <circle cx="220" cy="236" r="14" fill="currentColor" className="live-eye left-eye" />
              <circle cx="292" cy="236" r="14" fill="currentColor" className="live-eye right-eye" />
              {/* Mouth — opens wider with audio level */}
              <path
                d={speaking
                  ? `M208 280 q48 ${Math.round(30 + assistantLevel * 50)} 96 0`
                  : 'M208 280 q48 30 96 0'
                }
                fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
                className="live-mouth"
              />
            </svg>
          </div>
        </div>
        {state === 'connecting' && (
          <div className="live-status"><Loader2 size={14} className="spin" /> Connecting…</div>
        )}
        {connectionState === 'negotiating' && (
          <div className="live-status"><Loader2 size={14} className="spin" /> Negotiating session…</div>
        )}
        {connectionState === 'reconnecting' && (
          <div className="live-status reconnecting">
            <RefreshCw size={14} className="spin" /> Reconnecting…
          </div>
        )}
        {thinking && (
          <div className="live-status thinking-status">
            <span className="thinking-dots"><span /><span /><span /></span>
            Thinking…
          </div>
        )}
        {tool && <div className="live-status"><Wrench size={14} /> {tool}</div>}

        {/* Dynamic Soundwave / Audio Bar Visualizer - Dual mode for user/assistant */}
        <div className={`live-soundwave ${speaking || assistantLevel > 0.02 ? 'active assistant' : ''} ${!speaking && userLevel > 0.02 ? 'active user' : ''}`}>
          {[0.6, 1.2, 0.9, 1.4, 0.7].map((factor, idx) => (
            <span
              key={idx}
              className="soundwave-bar"
              style={{
                height: `${Math.max(6, Math.min(36, ((speaking ? assistantLevel : userLevel) || (speaking ? 0.25 : 0)) * 90 * factor))}px`,
                opacity: (speaking || assistantLevel > 0.02 || userLevel > 0.02) ? 0.95 : 0.3,
                background: speaking
                  ? 'linear-gradient(180deg, #10b981, #06b6d4)'
                  : 'linear-gradient(180deg, #ff6b35, #f59e0b)',
              }}
            />
          ))}
        </div>
      </div>

      {state === 'error' && (
        <div className="live-error">
          <AlertTriangle size={18} />
          <p>{error}</p>
          <button className="btn" onClick={handleEnd}>Close</button>
        </div>
      )}

      {/* Live captions */}
      {showCaptions && <div className="live-captions" aria-live="polite">
        {lines.map((l, i) => (
          <p key={i} className={`live-caption ${l.role}`}>
            <span>{l.text}</span>
          </p>
        ))}
      </div>}

      {/* Controls */}
      <div className="live-controls">
        <button
          className={`live-btn ${muted ? 'off' : ''}`}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          className={`live-btn ${speakerMuted ? 'off' : ''}`}
          onClick={toggleSpeaker}
          aria-label={speakerMuted ? 'Turn on AI voice' : 'Turn off AI voice (text/captions only)'}
          title={speakerMuted ? 'AI voice output is off — turn it back on' : 'Mute AI voice output (keeps replying in text)'}
        >
          {speakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button
          className={`live-btn ${screenOn ? 'active-screen' : ''}`}
          onClick={toggleScreen}
          aria-label={screenOn ? 'Stop screen sharing' : 'Share screen'}
        >
          {screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />}
        </button>
        {camOn && hasFlip && (
          <button className="live-btn" onClick={flipCam} aria-label="Switch between front and back camera" title="Flip camera">
            <SwitchCamera size={21} />
          </button>
        )}
        <button
          className="live-btn"
          onClick={() => setShowDevices(true)}
          aria-label="Choose camera and microphone"
          title="Camera & microphone"
        >
          <Video size={20} />
        </button>
        <button
          className={`live-btn${modelCanSee ? '' : ' warn'}`}
          onClick={() => setShowSettings(true)}
          aria-label="Live settings"
          // The badge already says "on-device", which is accurate and explains
          // nothing. Marking the button is what gets someone to open the panel
          // that tells them their model is text-only.
          title={modelCanSee ? 'Live settings' : 'Live settings — this model cannot see images'}
        >
          <Settings2 size={20} />
        </button>
        <button className="live-btn end" onClick={handleEnd} aria-label="End call">
          <PhoneOff size={22} />
        </button>
        <button
          className={`live-btn ${camOn ? '' : 'off'}`}
          onClick={toggleCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {camOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
        <button
          className={`live-btn ${(camOn || screenOn) && !visionOpen ? '' : 'off'}`}
          onClick={openVision}
          disabled={(!camOn && !screenOn) || visionLoading}
          aria-label="Ask about what the camera sees"
          title="Ask about this frame"
        >
          <Aperture size={22} />
        </button>
        <button
          className={`live-btn ${visionMode === 'always' ? 'active-autoscan' : 'off'}`}
          onClick={toggleVision}
          disabled={!camOn && !screenOn}
          aria-label={visionMode === 'always' ? 'Stop watching every turn' : 'Watch every turn'}
          title={visionMode === 'always'
            ? 'Watching every turn — the model sees the feed on every reply. Tap for look-when-relevant.'
            : 'Look-when-relevant. Tap to watch every turn (any model sees the feed continuously).'}
        >
          {visionMode === 'always' ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
        <button
          className={`live-btn ${autoScan ? 'active-autoscan' : 'off'}`}
          onClick={() => setVision({ autoScan: !autoScan })}
          disabled={!camOn && !screenOn}
          aria-label={autoScan ? 'Disable Auto-Scan' : 'Enable Auto-Scan'}
          title={autoScan ? 'Auto-Scan Active (Snapshots every 10s)' : 'Enable Auto-Scan (Snapshots every 10s)'}
        >
          <Scan size={20} />
        </button>
        <button
          className={`live-btn ${objectDetect ? 'active-autoscan' : 'off'}`}
          onClick={() => setVision({ objectDetect: !objectDetect, detectError: '' })}
          disabled={!camOn && !screenOn}
          aria-label={objectDetect ? 'Turn off object detection' : 'Turn on object detection'}
          title={detectError
            ? `Object detection: ${detectError}`
            : (objectDetect ? 'Object detection on — boxes shown on-device, never sent to the model' : 'Draw boxes around what the camera sees, on-device')}
        >
          <ScanEye size={20} />
        </button>
        <button
          className={`live-btn transcript-toggle ${showTranscript ? 'active-transcript' : ''}`}
          onClick={() => setState({ showTranscript: !showTranscript })}
          aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* Transcript Panel - using extracted component */}
      <LiveTranscriptPanel
        isOpen={showTranscript}
        onClose={() => setState({ showTranscript: false })}
        transcript={transcript}
        onCopy={copyText}
        copiedIdx={copiedIdx}
        formatTime={formatTime}
        features={features}
      />

      {/* Vision Modal - using extracted component */}
      <VisionModal
        isOpen={visionOpen}
        onClose={() => setVision({ open: false })}
        visionImage={visionImage}
        visionText={visionText}
        visionLoading={visionLoading}
        visionQ={visionQ}
        visionVia={visionVia}
        retakeFlash={retakeFlash}
        modelCanSee={modelCanSee}
        provider={provider}
        model={model}
        captureFrame={captureFrame}
        onRetake={() => { const b = captureFrame(visionQ); if (b) { setVision({ image: b, retakeFlash: true }); setTimeout(() => setVision({ retakeFlash: false }), 200) } }}
        onAskVision={askVision}
        onSetVisionQ={(q) => setVision({ q })}
        onAskInCall={askInCall}
        onCopyText={copyText}
        copiedIdx={copiedIdx}
        features={features}
      />
    </div>
  )
}