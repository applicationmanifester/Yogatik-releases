import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench,
  AlertTriangle, Monitor, MonitorOff, MessageSquare, Eye,
  Aperture, Volume2, VolumeX, Scan, ScanEye,
  RefreshCw, SwitchCamera, Settings2, Camera, Search,
  ChevronDown, ChevronUp, Check, Zap, Layers, PictureInPicture2, Maximize2, Square,
  Sun, Moon, Copy, Bot, Brain, Sparkles, MoreVertical, Captions, X,
  Flashlight, ZoomIn,   // [live-capture]
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cleanForSpeech } from '../video/speech'
import { autoPickModel } from '../api'
import { runAgent } from '../agent'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'
import { formatLiveSessionRecap } from '../live/sessionHandoff'
import { captureProfile, describeWithoutModel, getSharedVisualSource, needsMotion } from '../vision/source'
import { findVisionCandidate } from '../vision/capability'
import { detectObjects } from '../vision/detect'
import { temporalVideoBuffer } from '../vision/temporalBuffer'
import { buzz, isEnabled } from '../features'
import { VisionModal } from './VisionModal'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'
import { LiveDevicePicker } from './LiveDevicePicker'
import { LiveSettings } from './LiveSettings'
import { LiveModelSearchModal } from './LiveModelSearchModal'
import { LiveDockOverlay } from './LiveDockOverlay'
import { LiveArtifactStage } from './LiveArtifactStage'
import { LiveTelestration } from './LiveTelestration'
import { openDocumentPip, isDocumentPipSupported } from '../pipCompanion'
import { enumerate, canFlipCamera } from '../live/devices'
import * as liveMetrics from '../live/metrics'
import {
  // [live-capture] Capture-quality module: torch (honest support), digital
  // zoom that pre-crops the GRAB (the model + OCR see it), sharpest-of-3 for
  // the describe/OCR path, and the battery sampler the roadmap never had.
  setCaptureZoom, getCaptureZoom, torchSupported, setTorch,
  lowLightHint, sharpestFrame, sampleBattery, zoomPlan,
} from '../live/capture'
import { cameraGuard, resolveCameraAction } from '../live/guard'
// [live-recording] post-call coalescing, frame sampler + consent gate
import {
  coalesceLiveCall, createFrameSampler, ensureFrameConsent,
  estimateStorage, FRAME_MAX_EDGE, FRAME_QUALITY, FRAME_INTERVAL_MS,
  framesBudgetBytes, jpegSize,
} from '../live/recording'
import { LiveRecordingPlayer } from './LiveRecordingPlayer'
import { LiveRecapCard } from './LiveRecapCard'
import { LiveRecordingsPanel } from './LiveRecordingsPanel'
import { getSetting, setSetting, getLiveRecordings, deleteLiveRecording, saveLiveRecording } from '../db'
import { generateExecutiveSummary, extractActionItems } from '../live/sessionHandoff'
import { preconnectProvider } from '../live/latencyOptimizer'
import { backgroundWorkers } from '../backgroundWorkers'
// [live-offline] Fully-offline Live readiness + stack selector (Horizon-3 item 9).
import { checkOfflineReadiness, pickOfflineChat, resolveOfflineStack, DEFAULT_WEBLLM_MODEL, OLLAMA_PROVIDER, WEBLLM_PROVIDER, WEB_TOOL_NAMES } from '../live/offline'
// [live-step] Step-by-step mode state machine (Horizon-2 item 8).
import { extractPlan, recognizeStepCommand, createPlanState, dispatchStep, buildStepPrompt, stepLabel, MAX_STEPS } from '../live/stepMode'

/** Ticking elapsed timer for the Activity HUD — shows how long the AI has been thinking */
function ActivityTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [startTime])
  return (
    <span style={{
      fontVariantNumeric: 'tabular-nums',
      fontSize: '12px',
      opacity: 0.85,
      marginLeft: 4,
      color: '#60a5fa',
    }}>
      ({(elapsed / 1000).toFixed(1)}s)
    </span>
  )
}

/** Formats subtitle text to a rolling active sentence or clause (max ~130 chars) */
function formatRollingCaption(fullText) {
  if (!fullText) return ''
  const t = cleanForSpeech(fullText).replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= 130) return t
  const clauses = t.split(/(?<=[.?!;:\n])\s+/)
  const lastClause = clauses[clauses.length - 1] || ''
  if (lastClause.length >= 20 && lastClause.length <= 130) {
    return lastClause
  }
  const sliced = t.slice(-120)
  const firstSpace = sliced.indexOf(' ')
  return firstSpace > 0 ? '… ' + sliced.slice(firstSpace + 1) : sliced
}

/**
 * Full-screen face-to-face call with:
 * - Multi-ring animated orb that reacts to audio levels
 * - Screen sharing support
 * - Slide-out transcript sidebar with full conversation history
 * - Visual awareness indicators (provider, model, watching status)
 * - Thinking state shimmer between user speech and first token
 * - Activity HUD showing real-time AI status (thinking timer, tool usage)
 * - Mobile-optimized layout
 */
export function LiveView({
  engine = 'gemini', provider, apiKey, model, voice, voiceEngine, fallbacks,
  persona, disabledTools, modelCanSee, onEnd, onTranscript, features = {},
  availableModels = [], onModelChange,
  allProviders = {}, onProviderChange, keyInfo = {},
  conversationId = null, projectId = null,
  theme = 'dark', onToggleTheme,
}) {
  const [showModelSearch, setShowModelSearch] = useState(false)
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [isAutoPickingFastest, setIsAutoPickingFastest] = useState(false)
  const [endConfirm, setEndConfirm] = useState(false)
  const providerDropdownRef = useRef(null)
  const modelDropdownRef = useRef(null)

  useEffect(() => {
    if (!providerDropdownOpen && !modelDropdownOpen) return
    const handleClickOutside = (e) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(e.target)) {
        setProviderDropdownOpen(false)
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [providerDropdownOpen, modelDropdownOpen])

  const isProviderReady = useCallback((pId, pData) => {
    if (!pId) return false
    if (pData?.available === true) return true
    if (keyInfo?.[pId]?.configured === true) return true
    if (keyInfo?.[pId]?.key && String(keyInfo[pId].key).trim().length > 0) return true
    if (pData?.isOllama && (pData?.models || []).length > 0) return true
    if (pData?.noKey) return true
    return false
  }, [keyInfo])

  // Consolidated UI state to reduce re-renders
  const [uiState, setUiState] = useState({
    state: 'connecting',
    error: '',
    muted: false,
    // AI voice OUTPUT, separate from `muted` (the mic). Allows
    // listening to user speech with instant text/transcript responses only.
    speakerMuted: (() => {
      try {
        const saved = localStorage.getItem('yogatik_live_speaker_muted')
        if (saved !== null) return saved === 'true'
      } catch {}
      return !!features.liveTextOnly
    })(),
    camOn: false,
    screenOn: false,
    // 'auto' = look when asked / on scene change; 'always' = watch every turn
    // (works for ANY model — non-vision models are described on-device).
    // Default persists via the liveWatchAlways preference (Personalise panel).
    visionMode: features.liveWatchAlways ? 'always' : 'auto',
    speaking: false,
    thinking: false,
    tool: null,
    liveStatusText: '',
    reasoningText: '',
    showReasoning: false,
    lines: [],
    transcript: [],    // full history
    showTranscript: false,
    copiedIdx: -1,
    frameSent: false,
    liveVoice: (voiceEngine || 'system') === 'neural' ? 'loading' : 'system',
    activeProvider: { provider, model },
    connectionState: 'connecting', // connecting | negotiating | ready | reconnecting | failed
    userLevel: 0,
    assistantLevel: 0,
    breathingPhase: 0,
  })

  // Destructure for convenience in render and early hooks
  const {
    state, error, muted, speakerMuted, camOn, screenOn, visionMode, speaking, thinking, tool,
    liveStatusText, reasoningText, showReasoning,
    lines, transcript, showTranscript, copiedIdx, frameSent, liveVoice,
    activeProvider, connectionState, userLevel, assistantLevel, breathingPhase,
  } = uiState

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
  const [hudNotice, setHudNotice] = useState('')
  const [shutterFlash, setShutterFlash] = useState(false)
  const hudNoticeTimerRef = useRef(null)

  const showHudNotice = useCallback((msg) => {
    setHudNotice(msg)
    if (hudNoticeTimerRef.current) clearTimeout(hudNoticeTimerRef.current)
    hudNoticeTimerRef.current = setTimeout(() => setHudNotice(''), 2400)
  }, [])

  // Live-only overrides so a change applies to THIS call immediately; the
  // Personalise panel still owns the persisted default.
  const [liveRate, setLiveRate] = useState(1)
  const [liveVoiceId, setLiveVoiceId] = useState(voice || '')
  const [liveEngine, setLiveEngine] = useState(voiceEngine || 'system')
  const [showCaptions, setShowCaptions] = useState(features.liveCaptions !== false)
  const [responseMinimized, setResponseMinimized] = useState(false)

  // Keep showCaptions in sync with features.liveCaptions changes (e.g., from LiveSettings)
  useEffect(() => {
    setShowCaptions(features.liveCaptions !== false)
  }, [features.liveCaptions])
  const [copiedResponse, setCopiedResponse] = useState(false)
  const [showLiveReasoning, setShowLiveReasoning] = useState(false)
  const centerResponseRef = useRef(null)
  const [userScrolledResponse, setUserScrolledResponse] = useState(false)

  const handleVoiceEngineToggle = useCallback(() => {
    const next = liveEngine === 'system' ? 'neural' : 'system'
    setLiveEngine(next)
    if (sessionRef.current?.setVoiceEngine) {
      sessionRef.current.setVoiceEngine(next)
    }
    getSetting('chat_prefs', {}).then(p => setSetting('chat_prefs', { ...p, live_voice_engine: next })).catch(() => {})
    showHudNotice(next === 'system' ? '⚡ Fast Voice (0ms instant speech)' : '🧠 Neural HD Voice (Kokoro on-device)')
  }, [liveEngine, showHudNotice])

  // Extract latest assistant reply for active on-screen display
  const latestAssistantMsg = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].role === 'assistant' && transcript[i].type === 'message' && (transcript[i].text || transcript[i].reasoning)) {
        return transcript[i]
      }
    }
    const lastLine = lines[lines.length - 1]
    if (lastLine && lastLine.role === 'assistant' && lastLine.text) {
      return { role: 'assistant', text: lastLine.text, type: 'message' }
    }
    return null
  }, [transcript, lines])

  useEffect(() => {
    if (centerResponseRef.current && !userScrolledResponse) {
      centerResponseRef.current.scrollTop = centerResponseRef.current.scrollHeight
    }
  }, [latestAssistantMsg?.text, thinking, reasoningText, userScrolledResponse])

  const handleCopyResponse = useCallback((text) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedResponse(true)
      setTimeout(() => setCopiedResponse(false), 2000)
    }).catch(() => {})
  }, [])
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [hasFlip, setHasFlip] = useState(false)
  // [live-capture] Capture quality. `zoom` mirrors the capture module's zoom
  // for the preview transform; the module state itself is what every grab()
  // downstream encodes (the part the model and OCR see).
  const [zoom, setZoom] = useState(1)
  const [torchReady, setTorchReady] = useState(false)   // honestly detected, off until proven
  const [torchOn, setTorchOn] = useState(false)
  const pinchRef = useRef(null)
  const [viewMode, setViewMode] = useState('cinema') // 'cinema' | 'dock' | 'pip'
  const [artifacts, setArtifacts] = useState([])
  const [activeArtifactIdx, setActiveArtifactIdx] = useState(0)
  const [showArtifactStage, setShowArtifactStage] = useState(false)
  const [sidePanelTab, setSidePanelTab] = useState('transcript') // 'transcript' | 'artifacts'
  const [pipRoot, setPipRoot] = useState(null)

  // [live-recording] Recording + post-call recap state. `recRef` persists the
  // frame sampler and consent across cam/screen toggles for THIS call; it is
  // rebuilt fresh for each mount (each call gets its own recording, capped at
  // MAX_FRAMES_PER_CALL). The recap card holds the view until the user saves
  // or dismisses — only then does onEnd tear Live down.
  const recRef = useRef({ sampler: createFrameSampler(), consented: false })
  const handoffRef = useRef(null)
  const [recapCard, setRecapCard] = useState(null)
  const [recordingsList, setRecordingsList] = useState([])
  const [playingRecording, setPlayingRecording] = useState(null)
  const recordingOn = isEnabled(features, 'liveRecording')

  // [live-step] Step-by-step mode (Horizon-2 item 8): the model holds a plan,
  // user says "next"/"done"/"back"/"repeat"/"what's left", each advance fires
  // a camera check against the current step. Pure state machine lives in
  // live/stepMode.js; this component only holds the live plan + index.
  const [stepPlan, setStepPlan] = useState(null)
  const [stepState, setStepState] = useState({ index: 0, total: 0 })
  const [stepModeActive, setStepModeActive] = useState(false)

  // [live-offline] Fully-offline Live (Horizon-3 item 9 foundation). The
  // readiness profiler + pinned stack selector lives in live/offline.js. The
  // badge + toggle live here; the session is recreated when the toggle flips.
  const [offlineMode, setOfflineMode] = useState(false)
  const [offlineBadge, setOfflineBadge] = useState('')

  // [live-redesign] Cockpit state — presentation only. The four primary call
  // controls sit in one bottom command bar; every secondary action (transcript,
  // artifacts, settings, voice/provider/model pickers, view modes) lives
  // behind ONE hub-toggled "more" sheaf (right panel on desk, bottom sheet on
  // touch, focus grid on TV — the device variant is CSS-only, keyed off
  // data-device in 13-live-components.css). Closing a modal-like surface
  // returns focus to the command-bar hub per the a11y contract.
  const [sheafOpen, setSheafOpen] = useState(false)
  const sheafPanelRef = useRef(null)
  const sheafHubRef = useRef(null)

  const focusSoon = useCallback((el) => {
    const go = () => el?.current?.focus?.()
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go)
    else setTimeout(go, 0)
  }, [])

  const closeCockpitSheaf = useCallback((restoreFocus = true) => {
    setSheafOpen(false)
    if (restoreFocus) focusSoon(sheafHubRef)
  }, [focusSoon])

  // [live-redesign] Hub click: open when closed; when closing (open→closed)
  // hand focus back to the hub itself.
  const toggleCockpitSheaf = useCallback(() => {
    setSheafOpen(v => !v)
    if (sheafOpen) focusSoon(sheafHubRef)
  }, [sheafOpen, focusSoon])

  // [live-redesign] When a sheaf row opens a docking surface (transcript
  // drawer / artifact rail) the sheaf yields and the SURFACE takes focus — so
  // keyboard users land in what they asked for, never in a closed panel.
  const closeSheafAndFocusSurface = useCallback((surfaceId) => {
    setSheafOpen(false)
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const el = document.getElementById(surfaceId)
        if (el && typeof el.focus === 'function') el.focus()
      })
    }
  }, [])

  // Focus back to the hub whenever ANY cockpit surface closes, not only via
  // the sheaf's own close button (drawer close, backdrop click, …).
  const commandBarFocusReturn = useCallback(() => focusSoon(sheafHubRef), [focusSoon])

  // [live-redesign] Sheaf keyboard discipline: Escape closes (and refocuses
  // the hub), Tab is trapped inside while open — the sheaf is a dialog-like
  // popover, so focus must not leak to the stage underneath it.
  useEffect(() => {
    if (!sheafOpen) return undefined
    if (sheafPanelRef.current) focusSoon(sheafPanelRef)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeCockpitSheaf(true)
        return
      }
      if (e.key !== 'Tab') return
      const panel = sheafPanelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll('button, select, input, a[href], [tabindex]:not([tabindex="-1"])')
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const inside = panel.contains(document.activeElement)
      if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheafOpen, closeCockpitSheaf, focusSoon])


  const handlePopoutPip = useCallback(async () => {
    if (!isDocumentPipSupported()) {
      showHudNotice('Document Picture-in-Picture requires Chrome/Edge 116+')
      return
    }
    try {
      const pipWin = await openDocumentPip({
        width: 400,
        height: 620,
        onClosed: () => {
          setPipRoot(null)
          setViewMode('cinema')
        },
      })
      const mount = pipWin?.document?.getElementById('pip-root')
      if (mount) {
        setPipRoot(mount)
        setViewMode('pip')
        showHudNotice('Popped out to desktop companion')
      }
    } catch (err) {
      showHudNotice(err?.message || 'Failed to open PiP window')
    }
  }, [showHudNotice])

  useEffect(() => {
    getSetting('chat_prefs', {}).then(p => {
      if (p?.live_noise_suppression !== undefined) {
        setNoiseSuppression(!!p.live_noise_suppression)
      }
    }).catch(() => {})
  }, [])

  // Connect background worker notifications directly to the live artifact stage
  useEffect(() => {
    const unsub = backgroundWorkers.subscribe((tasks) => {
      const recent = (tasks || []).find(
        (t) => t.status === 'completed' && Date.now() - (t.completedAt || t.lastUpdated || 0) < 6000
      )
      if (recent) {
        setArtifacts((prev) => {
          if (prev.some((a) => a.result?.taskId === recent.id)) return prev
          return [
            {
              name: 'background_task',
              result: {
                taskId: recent.id,
                title: recent.title,
                persona: recent.agentPersona,
                status: recent.status,
                summary: recent.result?.summary || recent.logs?.slice(-1)[0] || 'Task completed.',
                logs: recent.logs,
              },
              time: Date.now(),
            },
            ...prev,
          ].slice(0, 15)
        })
        setShowArtifactStage(true)
        showHudNotice(`⚡ Task Done: ${recent.title.slice(0, 24)}`)
      }
    })
    return unsub
  }, [showHudNotice])

  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const turnRef = useRef({ role: null, text: '' })
  const transcriptEndRef = useRef(null)
  const frameTimerRef = useRef(null)



  const curProvider = activeProvider?.provider || provider || 'gemini'
  const isCurProviderReady = isProviderReady(curProvider, allProviders?.[curProvider])
  const currentModels = (allProviders[curProvider]?.models && allProviders[curProvider].models.length > 0)
    ? allProviders[curProvider].models
    : (availableModels || [])

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

  useEffect(() => {
    const PROVIDER_ORIGINS = {
      groq: 'https://api.groq.com',
      gemini: 'https://generativelanguage.googleapis.com',
      openai: 'https://api.openai.com',
      openrouter: 'https://openrouter.ai',
      nvidia: 'https://integrate.api.nvidia.com',
    }
    if (PROVIDER_ORIGINS[provider]) preconnectProvider(PROVIDER_ORIGINS[provider])
    for (const fb of (fallbacks || [])) {
      if (fb?.provider && PROVIDER_ORIGINS[fb.provider]) preconnectProvider(PROVIDER_ORIGINS[fb.provider])
    }
  }, [provider, fallbacks])

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
  const errorTimerRef = useRef(null)
  const TURN_GAP_MS = 1200

  // [live-step] Step-by-step mode callbacks — defined BEFORE pushDelta so
  // they're in scope when pushDelta's dependency array references them.
  // [live-step] Extract the plan from the FIRST assistant reply that looks
  // like a numbered/dash/ordinal list (≥2 items). Once we have it, the state
  // machine takes over: every "next"/"done"/"back"/"repeat"/"what's left"
  // utterance is intercepted, the plan index advances, and the step prompt
  // block is injected into EVERY cascade turn so the model holds the current
  // step. The realtime engine (gemini) cannot be intercepted the same way —
  // the sheaf strip's buttons drive the same events instead.
  const maybeExtractPlan = useCallback((text) => {
    if (stepPlan) return // already have a plan
    const plan = extractPlan(text)
    if (plan) {
      setStepPlan(plan)
      const st = createPlanState(plan)
      setStepState(st)
      setStepModeActive(true)
      liveMetrics.recordStepModeStart?.() // no-op if not defined
    }
  }, [stepPlan])

  // [live-step] Recognize step commands in the FINAL transcript (not streaming
  // deltas). Only the assistant's complete turns are checked for plan
  // extraction; user turns are checked for step commands.
  const handleTranscriptForStep = useCallback((role, text) => {
    if (!stepModeActive || !stepPlan) return
    if (role === 'assistant') {
      maybeExtractPlan(text)
    } else if (role === 'user') {
      const cmd = recognizeStepCommand(text)
      if (cmd) {
        const { state, used, event } = dispatchStep(stepPlan, stepState, cmd)
        if (used) {
          setStepState(state)
          if (event) {
            switch (event.type) {
              case 'advance':
                liveMetrics.recordStepAdvance?.()
                showHudNotice(`Step ${event.index + 1}/${stepState.total}: ${event.step}`)
                break
              case 'complete':
                liveMetrics.recordStepComplete?.()
                showHudNotice('Plan complete — all steps done')
                setStepModeActive(false)
                break
              case 'back':
                showHudNotice(`Back to step ${event.index + 1}: ${event.step}`)
                break
              case 'repeat':
                showHudNotice(`Repeat: ${event.step}`)
                break
              case 'remaining':
                showHudNotice(`Step ${event.index + 1} of ${event.total}, ${event.left} left`)
                break
              default:
            }
          }
        }
      }
    }
  }, [stepModeActive, stepPlan, stepState, maybeExtractPlan, showHudNotice])

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
        if (role === 'user') {
          const cleanText = text.trim()
          const cleanLast = last.text.trim()
          const normL = cleanLast.toLowerCase()
          const normT = cleanText.toLowerCase()
          if (normL === normT || normL.includes(normT) || normL.startsWith(normT)) {
            lines[lines.length - 1] = { role, text: last.text }
          } else if (normT.includes(normL) || normT.startsWith(normL)) {
            lines[lines.length - 1] = { role, text: cleanText }
          } else {
            lines[lines.length - 1] = { role, text: `${last.text} ${text}`.trim() }
          }
        } else {
          lines[lines.length - 1] = { role, text: last.text + text }
        }
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
        if (role === 'user') {
          const cleanText = text.trim()
          const cleanLast = last.text.trim()
          const normL = cleanLast.toLowerCase()
          const normT = cleanText.toLowerCase()
          if (normL === normT || normL.includes(normT) || normL.startsWith(normT)) {
            transcript[transcript.length - 1] = { ...last, text: last.text, time: Date.now(), streaming: false }
          } else if (normT.includes(normL) || normT.startsWith(normL)) {
            transcript[transcript.length - 1] = { ...last, text: cleanText, time: Date.now(), streaming: false }
          } else {
            transcript[transcript.length - 1] = { ...last, text: `${last.text} ${text}`.trim(), time: Date.now(), streaming: false }
          }
        } else {
          transcript[transcript.length - 1] = {
            ...last,
            text: last.text + text,
            reasoning: last.reasoning || prev.reasoningText || undefined,
            time: Date.now(),
            streaming: true,
          }
        }
      } else {
        transcript.push({
          role,
          text,
          type: 'message',
          time: Date.now(),
          streaming: role === 'assistant',
          reasoning: role === 'assistant' ? prev.reasoningText : undefined,
        })
      }
      return { ...prev, transcript }
    })
    const t = turnRef.current
    if (t.role === role) t.text += text
    else {
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      turnRef.current = { role, text }
    }
    // [live-step] Handle step commands/plan extraction on FINAL transcript
    // entries (not streaming deltas). Called after the state commits so
    // the transcript array already has the new entry.
    setTimeout(() => handleTranscriptForStep(role, text), 0)
  }, [onTranscript, handleTranscriptForStep])

  const handleModelChange = useCallback((newModel) => {
    if (!newModel) return
    setState(prev => ({
      ...prev,
      activeProvider: { ...prev.activeProvider, model: newModel }
    }))
    sessionRef.current?.setModel?.(newModel, modelCanSee)
    onModelChange?.(newModel)
    showHudNotice(`Model: ${newModel.split('/').pop().slice(0, 24)}`)
  }, [modelCanSee, onModelChange, showHudNotice])

  /**
   * One transient line through the toast banner — the SAME channel the
   * session's setVoice refusals surface through (`setState({ error })` +
   * the shared auto-clear timer), reused here for the camera-guard's
   * auto-switch notice instead of inventing new status plumbing.
   */
  const showStatusToast = useCallback((msg) => {
    setState({ error: msg })
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => {
      setState(prev => (prev.error === msg ? { ...prev, error: '' } : prev))
    }, 7000)
  }, [])

  // [live-offline] Compute the offline readiness badge for the current provider
  // state. Called when providers/models/keys change or when the user toggles
  // the offline switch. Pure logic lives in live/offline.js.
  const computeOfflineBadge = useCallback(() => {
    // These flags are what the app already knows — the readiness check is
    // pure and receives them as inputs (no probes here).
    const stack = resolveOfflineStack({
      providers: allProviders,
      ollamaModels: allProviders.ollama?.models || [],
      webllmReady: true, // WebLLM is always an option if loaded; the engine handles it
      webllmModel: DEFAULT_WEBLLM_MODEL,
      whisperAvailable: true, // Local STT path assumed available; actual probe in whisper.js
      kokoroAvailable: true,  // Kokoro assumed available; actual probe in video/speech.js
      localVisionAvailable: isEnabled(features, 'localVision'),
      systemTtsAvailable: true,
    })
    setOfflineBadge(stack.badge)
    return stack
  }, [allProviders, features])

  const handleProviderSelect = useCallback((newProvider) => {
    if (!newProvider || newProvider === (activeProvider.provider || provider)) return
    const provModels = allProviders[newProvider]?.models || []
    const newModel = provModels[0] || ''
    const newKey = keyInfo?.[newProvider]?.key || ''
    setState(prev => ({
      ...prev,
      activeProvider: { provider: newProvider, model: newModel }
    }))
    sessionRef.current?.setProvider?.(newProvider, newKey, newModel, modelCanSee)
    onProviderChange?.(newProvider, newModel)
    if (!isProviderReady(newProvider, allProviders[newProvider])) {
      showHudNotice(`⚠️ ${allProviders[newProvider]?.name || newProvider} needs an API key in Settings`)
    } else {
      showHudNotice(`Provider: ${allProviders[newProvider]?.name || newProvider}`)
    }
  }, [activeProvider.provider, provider, allProviders, keyInfo, isProviderReady, modelCanSee, onProviderChange, showHudNotice])

  const handlePickModelFromSearch = useCallback((targetProvider, targetModel) => {
    if (!targetModel) return
    const isDiffProv = targetProvider && targetProvider !== (activeProvider.provider || provider)
    const effProvider = targetProvider || activeProvider.provider || provider
    const targetKey = keyInfo?.[effProvider]?.key || ''
    setState(prev => ({
      ...prev,
      activeProvider: { provider: effProvider, model: targetModel }
    }))
    if (isDiffProv) {
      sessionRef.current?.setProvider?.(targetProvider, targetKey, targetModel, modelCanSee)
      onProviderChange?.(targetProvider, targetModel)
      if (!isProviderReady(targetProvider, allProviders[targetProvider])) {
        showHudNotice(`⚠️ ${allProviders[targetProvider]?.name || targetProvider} needs an API key in Settings`)
      } else {
        showHudNotice(`Model: ${targetModel.split('/').pop().slice(0, 24)} (${allProviders[targetProvider]?.name || targetProvider})`)
      }
    } else {
      sessionRef.current?.setModel?.(targetModel, modelCanSee)
      onModelChange?.(targetModel)
      showHudNotice(`Model: ${targetModel.split('/').pop().slice(0, 24)}`)
    }
  }, [activeProvider.provider, provider, allProviders, keyInfo, isProviderReady, modelCanSee, onProviderChange, onModelChange, showHudNotice])

  const handleAutoPickFastest = useCallback(async () => {
    if (isAutoPickingFastest) return
    setIsAutoPickingFastest(true)
    showHudNotice(`⚡ Probing fastest ${curProvider} model…`)
    try {
      // Always probe ONLY the currently-selected provider.
      // The user has chosen that provider intentionally; switching to
      // Groq because NVIDIA is slow would be confusing and invisible.
      let winner = null

      try {
        const res = await autoPickModel(curProvider, { max: 4, timeoutMs: 6000 })
        if (res?.model) winner = res
      } catch (err) {
        console.warn(`Auto-pick on ${curProvider} failed:`, err)
      }

      if (winner) {
        sessionRef.current?.setModel?.(winner.model, modelCanSee)
        onModelChange?.(winner.model)
        setState(prev => ({
          ...prev,
          activeProvider: { provider: curProvider, model: winner.model }
        }))
        showHudNotice(`⚡ Fastest on ${curProvider}: ${winner.model.split('/').pop()} (${winner.latencyMs}ms)`)
      } else {
        // Static fallback: pick a known-fast model from the current provider's list
        const candidates = (allProviders[curProvider]?.models || availableModels || [])
        const fastCandidate = candidates.find(m => /flash|mini|instant|8b|7b|turbo|haiku/i.test(m) && !/r1|reason|120b|671b|kosmos/i.test(m)) || candidates[0]
        if (fastCandidate) {
          handleModelChange(fastCandidate)
          showHudNotice(`⚡ ${curProvider} fastest: ${fastCandidate.split('/').pop()}`)
        } else {
          showHudNotice(`⚠️ No fast model found for ${curProvider}.`)
        }
      }
    } catch (e) {
      showHudNotice(`⚠️ ${e?.message || 'Auto-pick error'}`)
    } finally {
      setIsAutoPickingFastest(false)
    }
  }, [isAutoPickingFastest, curProvider, allProviders, availableModels, modelCanSee, onModelChange, handleModelChange, showHudNotice])

  /**
   * Horizon-1's last open item (LIVE_ROADMAP 4a): the camera guard does not
   * have to stop at "blocked". When the ACTIVE model is text-only, look for a
   * vision-capable one on the SAME provider — the stored probe verdict first
   * (the cache; no network at all), then 1-pixel probes spent only on the
   * models whose NAME says vision, and never more than a few.
   *
   * The camera press IS the consent to check: this runs only on the user's
   * explicit toggle action, never automatically mid-turn, and never at all
   * when the liveVisionAutoSwitch preference is off (the strict block).
   *
   * Returns the pure decision from guard.resolveCameraAction so toggleCam
   * can proceed, switch or keep blocking; the switch itself happens there,
   * where the session ref and App's model plumbing live.
   */
  const tryAutoVisionSwitch = useCallback(async () => {
    const allowSwitch = isEnabled(features, 'liveVisionAutoSwitch')
    const candidates = []
    if (allowSwitch) {
      const pid = activeProvider?.provider || provider
      const effKey = keyInfo?.[pid]?.key || apiKey
      // The active model IS the known-blind one — never probe or pick it.
      const skip = activeProvider?.model || model || ''
      const found = pid
        ? await findVisionCandidate({ provider: pid, apiKey: effKey, models: currentModels, skip })
        : null
      if (found) candidates.push({ model: found, canSee: true })
    }
    return resolveCameraAction({ canSee: modelCanSee, candidates, allowSwitch })
    // currentModels is derived from allProviders/availableModels + the active
    // provider each render; listing it keeps the callback honest to both.
  }, [features, activeProvider?.provider, activeProvider?.model, provider, model,
    apiKey, keyInfo, currentModels, modelCanSee])

  // Dynamically sync model prop changes without tearing down the live call
  useEffect(() => {
    if (model) {
      sessionRef.current?.setModel?.(model, modelCanSee)
      setState(prev => ({
        ...prev,
        activeProvider: { ...prev.activeProvider, model }
      }))
    }
  }, [model, modelCanSee])

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

  // [live-capture] Torch support is a property of the ACTIVE video track and
  // must be re-detected when the camera (or its track, after a flip) changes —
  // getCapabilities is the only honest source (capture.torchSupported), and
  // unsupported hardware simply never shows the button.
  useEffect(() => {
    if (!camOn) { setTorchReady(false); setTorchOn(false); return undefined }
    const track = getSharedVisualSource?.()?.stream?.getVideoTracks?.()[0]
    setTorchReady(torchSupported(track) === true)
    return undefined
  }, [camOn, deviceIds.cameraId])

  // [live-capture] Zoom serves the CAMERA grab. Camera off → reset, so module
  // state can never silently zoom some later screen capture the user never
  // asked to magnify.
  useEffect(() => {
    if (!camOn) { setCaptureZoom(1); setZoom(1) }
  }, [camOn])

  // [live-capture] Battery sampling, per-minute — LIVE_ROADMAP §8's unmeasured
  // risk ("1fps encode plus a neural voice plus WebGPU will cook a handset.
  // Nobody has measured it."). sampleBattery carries the getBattery guard;
  // metrics keeps only coarse 10% buckets.
  useEffect(() => {
    let alive = true
    const take = () => {
      sampleBattery().then((b) => {
        if (alive && b) liveMetrics.recordBatteryLevel(b.level)
      }).catch(() => {})
    }
    take()
    const id = setInterval(take, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

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
    // [live-step] Build the step prompt block if step mode is active. This
    // string is injected into the system prompt for EVERY cascade turn so the
    // model always holds the current step. Empty string when no plan → byte-
    // identical to a normal call.
    const stepPrompt = stepModeActive && stepPlan ? buildStepPrompt(stepPlan, { index: stepState.index, writes: 0 }) : ''

    // [live-offline] If offline mode is pinned, resolve the pinned stack and
    // override provider/model/voice with the local-only choices. The badge
    // tells the user exactly what's running and what's degraded.
    let effProvider = provider
    let effModel = model
    let effVoiceEngine = liveEngine
    let effVoice = voice
    let effApiKey = apiKey
    let effFallbacks = fallbacks
    let effPersona = persona
    let effDisabledTools = disabledTools
    if (offlineMode) {
      const stack = computeOfflineBadge()
      if (stack.ready && stack.chat) {
        effProvider = stack.chat.provider
        effModel = stack.chat.model
        effApiKey = ''
        effFallbacks = []
        effPersona = effPersona || 'You are a helpful, concise AI assistant running fully offline.'
        // Disable web tools in offline mode — the cascade engine respects this
        effDisabledTools = [...(disabledTools || []), ...WEB_TOOL_NAMES]
      }
      if (stack.stt) effVoiceEngine = 'whisper'
      if (stack.tts) {
        effVoiceEngine = stack.tts.engine === 'neural' ? 'neural' : 'system'
        effVoice = stack.tts.engine === 'neural' ? stack.tts.voice : undefined
      }
    }

    // One session record per mounted call. Local only — timings and counts,
    // never content: those are the numbers that decide what to build next and
    // the ones that carry no privacy cost.
    liveMetrics.startSession({ engine, provider, modelCanSee })
    const make = engine === 'gemini' ? createLiveSession : createCascadeSession
    const session = make({
      provider: effProvider, apiKey: effApiKey, model: effModel, voice: effVoice, voiceEngine: effVoiceEngine, fallbacks: effFallbacks,
      persona: effPersona, disabledTools: effDisabledTools, modelCanSee, camera: false, noiseSuppression,
      conversationId, projectId,
      visionMode: features.liveWatchAlways ? 'always' : 'auto',
      speakerMuted: uiState.speakerMuted,
      // [live-step] Inject the step prompt into every turn's system prompt
      systemPromptAddendum: stepPrompt,
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
          case 'thinking':
            setState(prev => ({
              ...prev,
              thinking: e.value,
              thinkingStartTime: e.value ? (e.startTime || Date.now()) : null,
              ...(e.value
                ? { reasoningText: '', liveStatusText: '🧠 Thinking & formulating response…' }
                : { liveStatusText: e.elapsedMs ? `⚡ Response ready (${(e.elapsedMs / 1000).toFixed(1)}s)` : prev.liveStatusText }
              ),
            }))
            break
          case 'interrupted':
            setState(prev => ({
              ...prev,
              thinking: false,
              speaking: false,
              tool: null,
              liveStatusText: '⏹️ Stopped',
              transcript: prev.transcript.map(t => t.streaming ? { ...t, streaming: false } : t),
            }))
            setTimeout(() => {
              setState(prev => (prev.liveStatusText === '⏹️ Stopped' ? { ...prev, liveStatusText: '' } : prev))
            }, 2500)
            break
          case 'status': {
            const statusMsg = e.text || e.message || ''
            setState(prev => ({
              ...prev,
              liveStatusText: statusMsg,
              transcript: [...prev.transcript, { type: 'status', text: statusMsg, time: Date.now() }],
            }))
            if (statusMsg && (statusMsg === '⏹️ Stopped' || statusMsg.includes('Stopped'))) {
              setTimeout(() => {
                setState(prev => (prev.liveStatusText === statusMsg ? { ...prev, liveStatusText: '' } : prev))
              }, 2500)
            }
            break
          }
          case 'reasoning':
            setState(prev => {
              const full = e.text || (prev.reasoningText + (e.delta || ''))
              const transcript = [...prev.transcript]
              let found = false
              for (let i = transcript.length - 1; i >= 0; i--) {
                if (transcript[i].role === 'assistant' && transcript[i].type === 'message') {
                  transcript[i] = { ...transcript[i], reasoning: full }
                  found = true
                  break
                }
              }
              if (!found) {
                transcript.push({
                  role: 'assistant',
                  type: 'message',
                  text: '',
                  reasoning: full,
                  time: Date.now(),
                  streaming: true,
                })
              }
              return {
                ...prev,
                reasoningText: full,
                transcript,
              }
            })
            break
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
          case 'artifact':
            if (e.artifact) {
              setArtifacts(prev => [e.artifact, ...prev.filter(a => a.name !== e.artifact.name || Math.abs(a.time - e.artifact.time) > 2000)].slice(0, 15))
              setShowArtifactStage(true)
            }
            break
          case 'toolResult': {
            // Keep the raw result object so images/videos/files/code render richly.
            const r = e.result
            if (e.name && r) {
              setArtifacts(prev => {
                const exists = prev.some(a => a.name === e.name && Math.abs(a.time - Date.now()) < 2000)
                if (exists) return prev
                return [{ name: e.name, result: r, time: Date.now() }, ...prev].slice(0, 15)
              })
              setShowArtifactStage(true)
            }
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
          case 'warning':
          case 'error':
            // Errors and warnings must NEVER close or tear down the live session!
            setState({ error: e.message })
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
            errorTimerRef.current = setTimeout(() => {
              setState(prev => prev.error === e.message ? { ...prev, error: '' } : prev)
            }, 7000)
            break
          case 'ended': setState({ state: 'ended' }); break
          default: break
        }
      },
    })
    sessionRef.current = session
    session.start().catch((err) => {
      if (cancelled) return
      let msg
      switch (err?.name) {
        case 'NotAllowedError':
          msg = 'Microphone and camera access were blocked. Allow them in your browser, then try again.'
          break
        case 'NotFoundError':
          msg = 'No microphone found. Plug in a microphone or headset and try again.'
          break
        case 'OverconstrainedError':
          msg = 'The previously selected microphone is no longer available. Unplug and replug it, or choose a different one in your system settings.'
          break
        default:
          msg = err?.message || String(err)
      }
      setState({ error: msg })
      // Record metrics without terminating the live session
      if (err?.fatal) liveMetrics.endSession(liveMetrics.END_REASON.ERROR)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => {
        setState(prev => prev.error === msg ? { ...prev, error: '' } : prev)
      }, 7000)
    })

    return () => {
      cancelled = true
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      const t = turnRef.current
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      liveMetrics.endSession(liveMetrics.END_REASON.UNMOUNT)
      session.stop()
    }
  }, [provider, apiKey, voice, voiceEngine, engine])

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
    // Only run auto-scan when vision is not disabled (off)
    if (visionState.autoScan && visionMode !== 'off' && (camOn || screenOn) && state === 'live') {
      timer = setInterval(() => {
        // The session grabs its own frame: it owns the stream, applies the
        // capture profile, and skips frames identical to the last one.
        sessionRef.current?.watch?.()
      }, 10000)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [visionState.autoScan, visionMode, camOn, screenOn, state])

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

  /**
   * [live-recording] Frame capture for the call recording. DELIBERATELY its own
   * loop — never merged with auto-scan or the object-detect HUD, which feed a
   * MODEL every tick; these thumbnails never leave the sim's browser and cost
   * nothing but IndexedDB. The consent gate runs BEFORE capture starts and is
   * size-labelled (downloadConsent pattern): a declined answer means this call
   * captures zero frames, and nothing here re-prompts per tick.
   *
   * Sampling reuses the aHash change-gate: `grab(true, …)` returns null when
   * the scene is unchanged, so a still scene costs one hash compare per tick
   * and zero thumbnails.
   */
  useEffect(() => {
    if (!recordingOn || !(camOn || screenOn) || state !== 'live') return undefined
    let cancelled = false
    let timer = null
    const sample = () => {
      if (cancelled) return
      const src = getSharedVisualSource()
      if (!src || src.stopped) return
      const b64 = src.grab(true, { maxEdge: FRAME_MAX_EDGE, quality: FRAME_QUALITY })
      if (!b64) return   // aHash: scene unchanged since the last thumbnail
      const dims = jpegSize(b64) || { w: FRAME_MAX_EDGE, h: Math.round(FRAME_MAX_EDGE * 0.75) }
      recRef.current.sampler.add({
        at: Date.now() - startTimeRef.current,   // offset from call start, like every other `at`
        thumb: `data:image/jpeg;base64,${b64}`,
        w: dims.w, h: dims.h,
      })
    }
    const start = async () => {
      if (!recRef.current.consented) {
        // BLOCKING ask, labelled with the worst-case storage of one call.
        const ok = await ensureFrameConsent(framesBudgetBytes())
        if (cancelled) return
        if (!ok) return   // no consent → no frames, for the whole call
        recRef.current.consented = true
      }
      if (cancelled) return
      timer = setInterval(sample, FRAME_INTERVAL_MS)
      sample()
    }
    start()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [recordingOn, camOn, screenOn, state])

  // [live-recording] The sheaf's recordings surface lists past calls' rows.
  const refreshRecordings = useCallback(() => {
    if (!recordingOn) return
    getLiveRecordings().then(r => setRecordingsList(Array.isArray(r) ? r : [])).catch(() => {})
  }, [recordingOn])
  useEffect(() => {
    if (!recordingOn) return
    refreshRecordings()
  }, [recordingOn, refreshRecordings])
  const removeRecording = useCallback(async (id) => {
    await deleteLiveRecording(id)
    refreshRecordings()
  }, [refreshRecordings])
  // [live-recording] Escape unwinds the playback overlay, mirroring the sheaf's
  // Escape discipline (player first — it sits above everything when open).
  useEffect(() => {
    if (!playingRecording) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setPlayingRecording(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [playingRecording])

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
    try {
      localStorage.setItem('yogatik_live_speaker_muted', v ? 'true' : 'false')
    } catch {}
    showHudNotice(v ? '⚡ Silent Live: Mic In ➔ Instant Streaming Text Out' : '🔊 AI Voice Output Restored')
    buzz(features, 30)
  }
  const toggleCam = async () => {
    const v = !camOn
    // Horizon 1 Guardrail: refuse the camera for a text-only model
    // (blind-model trap) with one line saying why — see live/guard.js.
    // Horizon-1's FINAL item: before refusing, auto-resolve. When the provider
    // also has a vision-capable model, switch the live call to it and open the
    // camera with one transient line; only unresolved cases — no reachable
    // candidate, the probe failed, or the user kept the strict mode — refuse,
    // exactly as before, still counted.
    const gate = cameraGuard(modelCanSee)
    if (v && !gate.allowed) {
      const decision = await tryAutoVisionSwitch()
      if (decision.action === 'switch') {
        const found = decision.model
        // Mid-call switch, no teardown: both engines just re-point the active
        // model. App's onModelChange re-resolves capability — probe verdicts
        // are cached on write, so it lands on `can see` without a second ask.
        sessionRef.current?.setModel?.(found, true)
        onModelChange?.(found)
        setState(prev => ({ ...prev, activeProvider: { ...prev.activeProvider, model: found } }))
        liveMetrics.recordAutoVisionSwitch()
        showStatusToast(`Switched to ${String(found).split('/').pop()} — it can see your camera`)
        buzz(features, 30)
      } else {
        liveMetrics.recordBlindModelRefusal()
        showHudNotice(`⚠️ ${decision.reason || gate.reason}`)
        buzz(features, 50)
        return
      }
    }
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
  // Toggle continuous watching: cycles through 'off' → 'auto' → 'always' → 'off'
  // 'always' makes ANY model (vision-capable or not) look at the camera/screen every turn
  // 'auto' looks only when you ask something visual or the scene changes
  // 'off' disables vision entirely (camera stays on but no frames sent/described)
  const toggleVision = () => {
    const next = visionMode === 'always' ? 'off' : visionMode === 'auto' ? 'always' : 'auto'
    setState({ visionMode: next })
    sessionRef.current?.setVisionMode?.(next)
    buzz(features, 30)
    const notices = {
      always: '👁️ Continuous Vision: AI inspects feed every turn',
      auto: '👁️ Look When Asked: On-demand visual inspection',
      off: '👁️ Vision Off: Camera on but no visual analysis',
    }
    showHudNotice(notices[next])
  }

  const toggleAutoScan = () => {
    const next = !autoScan
    setVision({ autoScan: next })
    buzz(features, 30)
    showHudNotice(next ? '⚡ Auto-Scan enabled (Periodic snapshot every 10s)' : '⚡ Auto-Scan paused')
  }

  const toggleObjectDetect = () => {
    const next = !objectDetect
    setVision({ objectDetect: next, detectError: '' })
    buzz(features, 30)
    showHudNotice(next ? '🎯 Object Detection HUD activated' : '🎯 Object Detection HUD disabled')
  }

  // [live-capture] Torch — the actionable answer to live/visionGuard's dark
  // refusal. setTorch reports a hardware refusal honestly; the button stays
  // because getCapabilities said support, but the toast says why it failed.
  const toggleTorch = async () => {
    const track = getSharedVisualSource()?.stream?.getVideoTracks?.()[0]
    const next = !torchOn
    const res = await setTorch(track, next)
    buzz(features, 30)
    if (!res?.ok) {
      showHudNotice(`⚠️ ${res?.reason || 'The torch would not light'}`)
      return
    }
    setTorchOn(next)
    showHudNotice(next ? '🔦 Torch on' : 'Torch off')
  }

  // [live-capture] One writer, two readers: React state drives the preview
  // transform, the capture module drives every grab() (model + OCR + HUD).
  // The slider and the pinch both write through here, so they can never
  // disagree about which zoom is live.
  const applyZoom = (z) => { setZoom(setCaptureZoom(z)) }

  // [live-capture] Pinch to zoom on touch — plain pointer events, engaged
  // only by TWO touch pointers, so dragging/telestration are untouched. The
  // starting zoom is read from the capture module, never from a stale render.
  const videoPinch = useMemo(() => {
    const reset = (pin) => ({ pts: pin.pts, startDist: 0, startZoom: getCaptureZoom() })
    const begin = (e) => {
      if (e.pointerType !== 'touch') return
      const pin = pinchRef.current || { pts: new Map(), startDist: 0, startZoom: getCaptureZoom() }
      const pts = pin.pts || new Map()
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && !pin.startDist) {
        const [a, b] = [...pts.values()]
        pin.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        pin.startZoom = getCaptureZoom()
      }
      pinchRef.current = { ...pin, pts }
    }
    const move = (e) => {
      const pin = pinchRef.current
      if (!pin?.startDist || e.pointerType !== 'touch') return
      const pt = pin.pts.get(e.pointerId)
      if (!pt || pin.pts.size < 2) return
      pt.x = e.clientX
      pt.y = e.clientY
      const [a, b] = [...pin.pts.values()]
      applyZoom(pin.startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / pin.startDist))
    }
    const end = (e) => {
      const pin = pinchRef.current
      if (!pin) return
      pin.pts.delete(e.pointerId)
      pinchRef.current = reset(pin)
    }
    return { onPointerDown: begin, onPointerMove: move, onPointerUp: end, onPointerCancel: end }
  }, [])

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
    // [live-capture] Same pre-crop the session's grab path gets — digital
    // zoom must reach the model + OCR through the fallback too, or the "zoom
    // is real" promise would silently depend on which path answered.
    const rect = zoomPlan({ width: v.videoWidth, height: v.videoHeight }, getCaptureZoom(), profile.crop)
    const scale = Math.max(rect.sw, rect.sh) > 0
      ? Math.min(1, profile.maxEdge / Math.max(rect.sw, rect.sh))
      : 1
    canvas.width = Math.round(rect.sw * scale)
    canvas.height = Math.round(rect.sh * scale)
    canvas.getContext('2d').drawImage(v, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', profile.quality).split(',')[1]
  }

  const openVision = () => {
    buzz(features, 35)
    setShutterFlash(true)
    setTimeout(() => setShutterFlash(false), 180)
    const b64 = captureFrame()
    if (!b64) return
    setVision({ image: b64, text: '', q: '', via: '' })
    setVision({ open: true })
    showHudNotice('📸 Snapshot captured — analyze frame')
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

    // Horizon 1b: a pitch-dark frame gets an honest refusal, not a model
    // guess — OCR/VLM output from it is invention, not reading.
    // [live-capture] When the torch is available, that dark refusal upgrades
    // into an ACTION: "tap the torch" — the command-bar and sheaf button that
    // really lights it — instead of the generic shrug.
    try {
      const [{ analyseImage }, { assessReadability }, { honestFrameNote }] = await Promise.all([
        import('../vision/imageStats'),
        import('../vision/readable'),
        import('../live/visionGuard'),
      ])
      const analysis = await analyseImage(dataUrl).catch(() => null)
      if (analysis && assessReadability(analysis).severity === 'block') {
        setVision({
          loading: false,
          text: lowLightHint(analysis, { torchSupported: torchReady })
            || honestFrameNote(analysis)
            || 'It is too dark for me to read that.',
        })
        return
      }
    } catch { /* frame check unavailable — proceed to the model */ }

    try {
      let finalText = ''
      if (modelCanSee) {
        setVision({ via: model ? model.split('/').pop() : provider })
        const isMotionQ = needsMotion(q)
        const userMessage = (isMotionQ && temporalVideoBuffer.hasFrames())
          ? temporalVideoBuffer.buildMultimodalPrompt(q, 3)
          : [
              { type: 'text', text: q + '\n\nIMPORTANT: Respond in natural language, not JSON format. Provide a clear, conversational description.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ]
        await runAgent({
          provider, apiKey, model,
          userMessage,
          toolsEnabled: false,
          onToken: (t) => {
            finalText += t
            setVision({ text: visionText + t })
          },
        })
      } else {
        setVision({ via: 'on-device' })
        // [live-capture] Sharpest-of-3 for the describe/OCR path: three grabs
        // ~350ms apart, scored by Laplacian variance, and the description
        // reads the sharpest frame. A mid-autofocus grab is exactly the one
        // that turns a pill imprint into OCR noise; ask for the best frame,
        // not the first.
        let describeUrl = dataUrl
        try {
          const pick = await sharpestFrame(() => captureFrame(q), { count: 3, gapMs: 350 })
          if (pick?.frame) describeUrl = `data:image/jpeg;base64,${pick.frame}`
        } catch { /* keep the already-captured frame */ }
        const { via, text } = await describeWithoutModel(describeUrl, q)
        finalText = text
        setVision({ via: via === 'ocr' ? 'OCR' : 'on-device VLM', text })
      }
      // Persist vision Q&A to conversation history
      if (conversationId && onTranscript && finalText) {
        try {
          await onTranscript('user', `[Vision] ${q}`)
          await onTranscript('assistant', `[Vision Analysis via ${visionVia || 'AI'}]: ${finalText}`)
        } catch (e) {
          console.error('Failed to persist vision analysis:', e)
        }
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

  const handleStopTurn = useCallback(() => {
    try {
      if (typeof sessionRef.current?.stopTurn === 'function') {
        sessionRef.current.stopTurn()
      } else if (typeof sessionRef.current?.interrupt === 'function') {
        sessionRef.current.interrupt(true)
      } else {
        sessionRef.current?.stop?.(true)
      }
    } catch (e) {
      console.warn('Error interrupting live turn:', e)
    }
    setState(prev => ({
      ...prev,
      thinking: false,
      speaking: false,
      tool: null,
      liveStatusText: '⏹️ Stopped',
      transcript: prev.transcript.map(t => t.streaming ? { ...t, streaming: false } : t),
    }))
    showHudNotice('⏹️ Stopped AI response')
    setTimeout(() => {
      setState(prev => (prev.liveStatusText === '⏹️ Stopped' ? { ...prev, liveStatusText: '' } : prev))
    }, 2500)
  }, [showHudNotice])

  const handleEnd = useCallback(() => {
    // The reason matters more than the duration. "Hung up after two turns" and
    // "the socket died" are indistinguishable in a length histogram and mean
    // opposite things.
    liveMetrics.endSession(liveMetrics.END_REASON.USER)
    try { sessionRef.current?.stop?.() } catch {}
    const endedAt = Date.now()
    const durationSec = Math.max(1, (endedAt - startTimeRef.current) / 1000)
    const validTranscripts = (transcript || []).filter(t => t.type === 'message' && t.text)
    const toolsRun = (transcript || []).filter(t => t.type === 'toolResult')
    const recapMarkdown = formatLiveSessionRecap({
      durationSec,
      transcripts: validTranscripts,
      toolsExecuted: toolsRun,
      provider: activeProvider.provider || provider,
      model: activeProvider.model || model,
    })
    // [live-recording] Coalesce THIS call — always (the recap card's artefacts
    // and sources come from the tool events, feature or not) — and persist the
    // recording row on-device when the feature is on. Recording rows never
    // appear in the whole-database backup (deliberate — see db.js), so a row's
    // only exits are playback, per-row Export-JSON, and Delete.
    const clip = coalesceLiveCall({ transcript: transcript || [], startedAt: startTimeRef.current })
    let recording = null
    if (recordingOn) {
      try {
        const frames = recRef.current.sampler.frames()
        recording = {
          conversationId: conversationId ?? null,
          startedAt: startTimeRef.current,
          endedAt,
          durationSec,
          provider: activeProvider.provider || provider,
          model: activeProvider.model || model,
          turns: clip.turns,
          toolEvents: clip.toolEvents,
          sources: clip.sources,
          artefacts: clip.artefacts,
          frames,
          sizeBytes: estimateStorage({ turns: clip.turns, toolEvents: clip.toolEvents, frames }),
        }
        saveLiveRecording(recording).then(id => { if (id != null) refreshRecordings() }).catch(() => {})
      } catch { /* a failed recording must not block the recap or the call end */ }
    }
    // Handoff is DEFERRED while the recap card is up: Live stays mounted so the
    // user can save/copy/play before the normal onEnd teardown runs.
    handoffRef.current = {
      durationSec,
      transcripts: validTranscripts,
      toolsExecuted: toolsRun,
      recapMarkdown,
    }
    setState({ state: 'ended' })   // stage idles; the session is already stopped
    setRecapCard({
      markdown: recapMarkdown,
      summary: generateExecutiveSummary(validTranscripts),
      actions: extractActionItems(validTranscripts),
      artefacts: clip.artefacts,           // tool events → artefact labels
      sources: clip.sources,
      recording,
    })
  }, [transcript, conversationId, recordingOn, activeProvider, provider, model, refreshRecordings])

  // [live-recording] Card CTAs. "Save to conversation" rides the SAME
  // message-save path every spoken turn uses — onTranscript → App's
  // saveLiveTurn → saveMessage — so the recap lands in the call's conversation
  // like any other turn. Dismiss/saved-then-close proceeds with the deferred
  // onEnd handoff (App appends the recap to the chat it already did).
  const handleRecapSave = useCallback(async (markdown) => {
    try { await onTranscript?.('assistant', markdown) } catch {}
  }, [onTranscript])
  const handleRecapClose = useCallback(() => {
    const handoff = handoffRef.current
    setRecapCard(null)
    if (handoff) onEnd?.(handoff)
  }, [onEnd])

  // Model vision capability is resolved authoritatively in vision/capability.js
  // (name heuristic + cached 1-pixel probe) and arrives here as the `modelCanSee`
  // prop — see App.jsx getVisionStatus() and LiveSettings. Do NOT re-derive it
  // locally with a name regex: 'flash'/'pro' match text-only models and miss
  // llava/pixtral/qwen-vl, which is exactly how the camera ends up on with a
  // model that cannot see.

  // Orb scale tracks the model's own output level
  const orbScale = useMemo(() => 1 + (speaking ? assistantLevel * 0.45 : 0), [speaking, assistantLevel])
  const ring2Scale = useMemo(() => 1 + (speaking ? assistantLevel * 0.3 : 0), [speaking, assistantLevel])
  const ring3Scale = useMemo(() => 1 + (speaking ? assistantLevel * 0.18 : 0), [speaking, assistantLevel])
  const breathingScale = useMemo(() => 1 + Math.sin(breathingPhase) * 0.02, [breathingPhase])

  const telestrationTargets = useMemo(() => {
    return (detections || []).map((d, i) => {
      const b = d.box || {}
      const xmin = Math.max(0, Math.min(1, b.xmin ?? 0))
      const xmax = Math.max(0, Math.min(1, b.xmax ?? 0))
      const ymin = Math.max(0, Math.min(1, b.ymin ?? 0))
      const ymax = Math.max(0, Math.min(1, b.ymax ?? 0))
      return {
        id: `det-${i}-${d.label}`,
        label: `${(d.label || 'target').toUpperCase()}${d.score ? ` (${Math.round(d.score * 100)}%)` : ''}`,
        score: d.score,
        box: {
          x: 1 - xmax, // mirrored compensation for .live-self
          y: ymin,
          w: Math.max(0.05, xmax - xmin),
          h: Math.max(0.05, ymax - ymin),
        },
      }
    })
  }, [detections])

  return (
    <div className={`live-view ${viewMode === 'dock' ? 'mode-dock' : ''} ${(showTranscript || showArtifactStage) ? 'has-side-panel' : ''}${showTranscript ? ' live-drawer-open' : ''}${showArtifactStage && artifacts.length > 0 ? ' live-rail-open' : ''}`} data-theme={theme} role="dialog" aria-modal="true" aria-label="Live conversation">
      {/* Floating Dynamic Island Companion Dock */}
      {viewMode === 'dock' && (
        <LiveDockOverlay
          state={state}
          speaking={speaking}
          thinking={thinking}
          tool={tool}
          liveStatusText={liveStatusText}
          muted={muted}
          speakerMuted={speakerMuted}
          camOn={camOn}
          userLevel={userLevel}
          assistantLevel={assistantLevel}
          activeArtifact={artifacts[activeArtifactIdx] || artifacts[0]}
          onToggleMute={toggleMute}
          onToggleSpeakerMute={toggleSpeaker}
          onToggleCam={toggleCam}
          onExpandCinema={() => setViewMode('cinema')}
          onPopoutPip={handlePopoutPip}
          onEndCall={handleEnd}
          onSelectArtifact={() => {
            setViewMode('cinema')
            setSidePanelTab('artifacts')
            // [live-redesign] Artifacts now dock as their own rail, so surfacing
            // one no longer keeps the transcript drawer open underneath it.
            setState(prev => ({ ...prev, showTranscript: false }))
            setShowArtifactStage(true)
          }}
        />
      )}

      {/* Document PiP Companion Window Portal */}
      {pipRoot && ReactDOM.createPortal(
        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: '#0a0f1d' }}>
          <LiveDockOverlay
            state={state}
            speaking={speaking}
            thinking={thinking}
            tool={tool}
            liveStatusText={liveStatusText}
            muted={muted}
            speakerMuted={speakerMuted}
            camOn={camOn}
            userLevel={userLevel}
            assistantLevel={assistantLevel}
            activeArtifact={artifacts[activeArtifactIdx] || artifacts[0]}
            onToggleMute={toggleMute}
            onToggleSpeakerMute={toggleSpeaker}
            onToggleCam={toggleCam}
            onExpandCinema={() => {
              try { pipRoot.ownerDocument.defaultView?.close() } catch {}
              setPipRoot(null)
              setViewMode('cinema')
            }}
            onPopoutPip={() => {}}
            onEndCall={handleEnd}
            onSelectArtifact={() => {
              try { pipRoot.ownerDocument.defaultView?.close() } catch {}
              setPipRoot(null)
              setViewMode('cinema')
              setSidePanelTab('artifacts')
              // [live-redesign] Same surface split: artifact rail replaces the
              // transcript drawer instead of sharing it.
              setState(prev => ({ ...prev, showTranscript: false }))
              setShowArtifactStage(true)
            }}
          />
          {artifacts.length > 0 && (
            <div style={{ flex: 1, overflow: 'hidden', padding: 12 }}>
              <LiveArtifactStage
                artifacts={artifacts}
                activeIndex={activeArtifactIdx}
                onSelectIndex={setActiveArtifactIdx}
                onClose={() => {}}
              />
            </div>
          )}
        </div>,
        pipRoot
      )}

      {/* [live-capture] The preview transform mirrors the zoom the model
          actually sees (capture zoomPlan pre-crops the grab canvas); the view
          stays mirrored. Pinch-on-touch + the sheaf slider both drive it via
          the capture module. touch-action="none" only on the camera preview so
          a two-finger page-zoom cannot fight the control. */}
      <video
        ref={videoRef}
        className={`live-self ${camOn ? '' : 'off'}`}
        autoPlay playsInline muted
        style={{
          touchAction: camOn ? 'none' : undefined,
          transform: (camOn && zoom > 1) ? `scaleX(-1) scale(${zoom})` : undefined,
        }}
        {...videoPinch}
      />
      {/* Sci-Fi Camera Viewfinder & Scanline Overlay (Vision-Agents inspired) */}
      {(camOn || screenOn) && (
        <div className="live-viewfinder" aria-hidden="true">
          <div className="live-vf-bracket tl" />
          <div className="live-vf-bracket tr" />
          <div className="live-vf-bracket bl" />
          <div className="live-vf-bracket br" />
          {objectDetect && <div className="live-detect-scanline" />}
        </div>
      )}

      {/* Augmented Reality / Neon Telestration Laser Focus Overlay */}
      {(camOn || screenOn) && (
        <LiveTelestration
          targets={telestrationTargets}
          onTargetClick={(target) => {
            showHudNotice(`Target focus: ${target.label}`)
          }}
        />
      )}
      {/* Object-detection boxes */}
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
                <div className="live-detect-corner tl" />
                <div className="live-detect-corner tr" />
                <div className="live-detect-corner bl" />
                <div className="live-detect-corner br" />
                <div className="live-detect-crosshair" />
                <div className="live-detect-tag">
                  <span className="live-detect-dot" />
                  <span className="live-detect-label">{d.label?.toUpperCase()}</span>
                  {d.score ? <span className="live-detect-score">{Math.round(d.score * 100)}%</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <LiveSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        modelCanSee={modelCanSee}
        provider={activeProvider.provider || provider}
        model={activeProvider.model || model}
        availableModels={availableModels}
        onModelChange={(m) => { handleModelChange(m); setShowSettings(false) }}
        visionMode={visionMode}
        onVisionMode={(m) => { setState({ visionMode: m }); sessionRef.current?.setVisionMode?.(m) }}
        voiceEngine={liveEngine}
        onVoiceEngine={(e) => {
          const r = sessionRef.current?.setVoiceEngine?.(e)
          if (r?.success === false) setState({ error: r.error })
          else {
            setLiveEngine(e)
            getSetting('chat_prefs', {}).then(p => setSetting('chat_prefs', { ...p, live_voice_engine: e })).catch(() => {})
          }
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
        noiseSuppression={noiseSuppression}
        onNoiseSuppression={(val) => {
          setNoiseSuppression(val)
          sessionRef.current?.setNoiseSuppression?.(val)
          getSetting('chat_prefs', {}).then(p => setSetting('chat_prefs', { ...p, live_noise_suppression: val })).catch(() => {})
        }}
      />

      <LiveDevicePicker
        open={showDevices}
        onClose={() => setShowDevices(false)}
        onPick={pickDevice}
        currentCameraId={deviceIds.cameraId}
        currentMicId={deviceIds.micId}
        micSwitchable={engine === 'gemini'}
      />

      {/* [live-redesign] Cockpit chrome: a thin STATUS STRIP (stage stays the
          hero) with no controls in it, then ONE bottom command bar, then the
          hub-toggled "more" sheaf holding every secondary surface, plus the
          artifacts rail. Handlers below are moved verbatim from the retired
          badges row / controls dock. */}
      <div className="live-cockpit-top" aria-label="Live status">
        <span className="live-ck-pill provider" title="AI provider">
          <span
            className="live-ready-indicator"
            aria-hidden="true"
            style={{ backgroundColor: isCurProviderReady ? '#22c55e' : 'rgba(148, 163, 184, 0.4)' }}
            title={isCurProviderReady ? 'API Key updated & ready' : 'Needs API Key'}
          />
          <span>{allProviders[curProvider]?.name || curProvider}</span>
        </span>
        <span className="live-ck-pill model" title="Active model">
          {(activeProvider.model || model || '').split('/').pop()}
        </span>

        {/* Scene watching badges — verbatim copies from the retired badges row */}
        {screenOn && (
          <span className="live-ck-pill scene" title="Screen sharing is on"><Monitor size={12} /> Screen</span>
        )}
        {visionMode === 'always' && (
          <span className="live-ck-pill scene" title="AI inspects camera feed on every turn">
            <Eye size={12} /> Watching Live
          </span>
        )}
        {autoScan && (
          <span className="live-ck-pill scene" title="Auto-scan capturing feed every 10s">
            <Scan size={12} /> Auto-Scan 10s
          </span>
        )}
        {objectDetect && (
          <span className="live-ck-pill scene" title="On-device neural object detection HUD">
            <ScanEye size={12} /> Object HUD {detections.length > 0 ? `(${detections.length})` : ''}
          </span>
        )}
        {/* A11y fix: this used to be a clickable <span> — now a real button.
            The same toggle also lives in the Sound & captions section. */}
        {speakerMuted && (
          <button
            type="button"
            className="live-ck-pill scene live-ck-muted-btn"
            onClick={toggleSpeaker}
            title="Silent Live: AI voice muted — streaming text/transcript out only. Click to unmute."
          >
            <VolumeX size={11} /> ⚡ Silent Live (Text Only)
          </button>
        )}

        {/* [live-redesign] Latency SLO badge + text-fallback nudge relocated
            from the orb area into the status strip (props verbatim). */}
        {liveMetrics.currentSession()?.lastLatencyMs != null && (
          <div
            className={`live-latency-badge ${liveMetrics.latencyGrade(liveMetrics.currentSession().lastLatencyMs, (camOn || screenOn) ? 'multimodal' : 'voice')}`}
            title={`First-word latency: ${Math.round(liveMetrics.currentSession().lastLatencyMs)}ms (SLO target: ${(camOn || screenOn) ? liveMetrics.MULTIMODAL_SLO_MS : liveMetrics.VOICE_SLO_MS}ms)`}
            role="status"
            aria-label={`Latency ${Math.round(liveMetrics.currentSession().lastLatencyMs)} milliseconds`}
          >
            <span className="slo-dot" aria-hidden="true" />
            <span>{Math.round(liveMetrics.currentSession().lastLatencyMs)}ms</span>
          </div>
        )}
        {liveMetrics.shouldSuggestTextFallback() && (
          <div className="live-status warning-status" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
            <AlertTriangle size={13} />
            <span>Voice latency high. You can switch to text mode.</span>
          </div>
        )}
      </div>

      {/* [live-redesign] The "more" sheaf — every secondary control behind ONE
          hub in the command bar. role="dialog" (non-modal), Escape closes and
          returns focus to the hub, Tab is trapped while open. Desk / touch /
          TV variants are CSS-only via [data-device]. Provider & model pickers
          below are the ORIGINAL markup moved verbatim (refs intact). */}
      <div
        id="live-cockpit-sheaf"
        ref={sheafPanelRef}
        className={`live-cockpit-sheaf${sheafOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label="More live controls"
        aria-hidden={!sheafOpen}
        tabIndex={-1}
      >
        {sheafOpen && (
          <div className="live-cockpit-sheaf-viewport">
            <div className="live-cockpit-sheaf-head">
              <span>More controls</span>
              <button
                type="button"
                className="live-cockpit-sheaf-close"
                onClick={() => closeCockpitSheaf(true)}
                aria-label="Close more controls"
              >
                <X size={16} />
              </button>
            </div>
            <div className="live-cockpit-sheaf-scroll">
              <section className="live-cockpit-sheaf-section" aria-label="Panels and tools">
                <h3>Panels & tools</h3>
                <button
                  type="button"
                  className={`live-cockpit-row${(showTranscript || showArtifactStage) ? ' is-engaged' : ''}`}
                  onClick={() => {
                    if (showTranscript || showArtifactStage) {
                      setState(prev => ({ ...prev, showTranscript: false }))
                      setShowArtifactStage(false)
                    } else {
                      // One-surface intent: the drawer takes over the panel
                      // zone, so the sheaf yields and hands focus to it.
                      closeSheafAndFocusSurface('live-transcript-drawer')
                      setSidePanelTab('transcript')
                      setState(prev => ({ ...prev, showTranscript: true }))
                    }
                  }}
                  aria-expanded={showTranscript || showArtifactStage}
                  aria-controls="live-transcript-drawer"
                  title="Transcript & AI Activity (Side Panel)"
                >
                  <MessageSquare size={16} />
                  <span>Transcript & activity</span>
                  {artifacts.length > 0 && <span className="live-btn-badge">{artifacts.length}</span>}
                </button>
                {artifacts.length > 0 && (
                  <button
                    type="button"
                    className={`live-cockpit-row${(showTranscript || showArtifactStage) && sidePanelTab === 'artifacts' ? ' is-engaged' : ''}`}
                    onClick={() => {
                      if ((showTranscript || showArtifactStage) && sidePanelTab === 'artifacts') {
                        setShowArtifactStage(false)
                        setState(prev => ({ ...prev, showTranscript: false }))
                      } else {
                        closeSheafAndFocusSurface('live-artifact-rail')
                        setSidePanelTab('artifacts')
                        setShowArtifactStage(true)
                        setState(prev => ({ ...prev, showTranscript: false }))
                      }
                    }}
                    aria-expanded={(showTranscript || showArtifactStage) && sidePanelTab === 'artifacts'}
                    aria-controls="live-artifact-rail"
                    title="Toggle Live Artifacts & Tools (Side Drawer)"
                  >
                    <Layers size={16} style={{ color: '#38bdf8' }} />
                    <span>Artifacts ({artifacts.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  className="live-cockpit-row"
                  onClick={openVision}
                  disabled={(!camOn && !screenOn) || visionLoading}
                  title="Capture snapshot & ask AI (instant scene analysis)"
                >
                  <Aperture size={16} />
                  <span>Snapshot & ask</span>
                </button>
                <button
                  type="button"
                  className="live-cockpit-row"
                  onClick={() => {
                    setShowDevices(true)
                    closeCockpitSheaf(false)
                  }}
                  title="Switch camera & microphone"
                >
                  <Camera size={16} />
                  <span>Camera & mic</span>
                </button>
                <button
                  type="button"
                  className={`live-cockpit-row${modelCanSee ? '' : ' warn'}`}
                  onClick={() => {
                    setShowSettings(true)
                    closeCockpitSheaf(false)
                  }}
                  title={modelCanSee ? 'Live settings' : 'Live settings — this model cannot see images'}
                >
                  <Settings2 size={16} />
                  <span>Live settings</span>
                </button>
                <button
                  type="button"
                  className="live-cockpit-row"
                  onClick={() => {
                    setShowModelSearch(true)
                    closeCockpitSheaf(false)
                  }}
                  title="Search all AI models across all providers"
                >
                  <Search size={16} />
                  <span>Search models</span>
                </button>
                <button
                  type="button"
                  className="live-cockpit-row"
                  onClick={handleAutoPickFastest}
                  disabled={isAutoPickingFastest}
                  title="Auto-select the fastest, lowest-latency model for instant voice responses"
                >
                  <Zap size={16} className={isAutoPickingFastest ? 'spin' : ''} />
                  <span>{isAutoPickingFastest ? 'Testing speed…' : 'Auto-pick fastest'}</span>
                </button>
                {/* [live-recording] The storage surface: past calls' recordings
                    with Play / Export-JSON / Delete. The panel owns the db
                    round trip itself, Export reuses chatExport's plumbing. */}
                {recordingOn && (
                  <section className="live-rec-sheaf" aria-label="Recordings">
                    <LiveRecordingsPanel
                      onPlay={(rec) => { setPlayingRecording(rec); setSheafOpen(false) }}
                      onError={(e) => showHudNotice(`⚠️ ${e?.message || 'Export failed'}`)}
                    />
                  </section>
                )}
              </section>

              {/* Auto-scan and the object-detection HUD both need a live feed,
                  so they only appear when one is on (verbatim gating from the
                  old controls dock). */}
              <section className="live-cockpit-sheaf-section" aria-label="Scene and watching">
                <h3>Scene & watching</h3>
                <button
                  type="button"
                  className={`live-cockpit-row${visionMode === 'always' ? ' is-engaged' : ''}`}
                  onClick={toggleVision}
                  title={`Vision: ${visionMode === 'always' ? 'Continuous' : visionMode === 'auto' ? 'On-demand' : 'Off'}. Click to cycle.`}
                >
                  {visionMode === 'always' && <Eye size={16} style={{ color: '#22c55e' }} />}
                  {visionMode === 'auto' && <Eye size={16} style={{ color: '#38bdf8' }} />}
                  {visionMode === 'off' && <Eye size={16} style={{ color: '#ef4444' }} />}
                  <span>Watching: {visionMode === 'always' ? 'Everything' : visionMode === 'auto' ? 'On-demand' : 'Off'}</span>
                </button>
                {(camOn || screenOn) && (
                  <button
                    type="button"
                    className={`live-cockpit-row${autoScan ? ' is-engaged' : ''}`}
                    onClick={toggleAutoScan}
                    aria-pressed={autoScan}
                    title={autoScan
                      ? 'Auto-scan ON — a frame is sent every 10s so the AI keeps up without being asked. This spends tokens; tap to stop.'
                      : 'Auto-scan: send a frame every 10s so the AI follows along unprompted'}
                  >
                    <Scan size={16} />
                    <span>Auto-scan (10s)</span>
                  </button>
                )}
                {(camOn || screenOn) && (
                  <button
                    type="button"
                    className={`live-cockpit-row${objectDetect ? ' is-engaged' : ''}`}
                    onClick={toggleObjectDetect}
                    aria-pressed={objectDetect}
                    title={objectDetect
                      ? 'Object detection HUD ON — boxes are labelled on-device (no tokens spent). Tap to hide.'
                      : 'Object detection HUD: label what is in view, entirely on-device (no tokens spent)'}
                  >
                    <ScanEye size={16} />
                    <span>Object detection HUD</span>
                  </button>
                )}
                {camOn && hasFlip && (
                  <button
                    type="button"
                    className="live-cockpit-row"
                    onClick={flipCam}
                    title="Flip camera"
                  >
                    <SwitchCamera size={16} />
                    <span>Flip camera</span>
                  </button>
                )}
              </section>

              {/* [live-capture] Capture & light — the hands-busy quality
                  controls. Zoom pre-crops the GRAB canvas (the model and OCR
                  see the zoomed frame — CSS zoom would only change what the
                  user sees); the torch row shares state with the command-bar
                  button. Camera-only: a screen share has no torch, and zoom
                  there without an explicit ask is mislaid intent. */}
              {camOn && (
                <section className="live-cockpit-sheaf-section" aria-label="Capture and light">
                  <h3>Capture &amp; light</h3>
                  {torchReady && (
                    <button
                      type="button"
                      className={`live-cockpit-row${torchOn ? ' is-engaged' : ''}`}
                      onClick={toggleTorch}
                      aria-pressed={torchOn}
                      title={torchOn
                        ? 'Torch ON — tap to turn off'
                        : 'Torch: light a dark scene so the AI can read it'}
                    >
                      <Flashlight size={16} style={{ color: torchOn ? '#fbbf24' : undefined }} />
                      <span>{torchOn ? 'Torch ON' : 'Torch'}</span>
                    </button>
                  )}
                  <div
                    className="live-cockpit-row"
                    style={{ cursor: 'default' }}
                    title="Digital zoom pre-crops the frame before it is captured, so the AI sees the zoomed view — 4x max, edge-guarded"
                  >
                    <ZoomIn size={16} />
                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ flex: 'none' }}>Zoom</span>
                      <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.25}
                        value={zoom}
                        onChange={(e) => applyZoom(e.target.value)}
                        aria-label="Digital zoom for the camera frames the AI sees"
                        style={{ flex: 1, minWidth: 40, accentColor: '#ff6b35' }}
                      />
                      <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
                        {zoom.toFixed(2)}×
                      </span>
                    </label>
                  </div>
                </section>
              )}

              <section className="live-cockpit-sheaf-section" aria-label="Sound and captions">
                <h3>Sound & captions</h3>
                <button
                  type="button"
                  className={`live-cockpit-row${speakerMuted ? ' is-engaged' : ''}`}
                  onClick={toggleSpeaker}
                  aria-pressed={speakerMuted}
                  title={speakerMuted ? 'AI voice muted — tap to turn voice on' : 'Mute AI voice output (fast silent text/transcript only)'}
                >
                  {speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <span>{speakerMuted ? 'AI voice OFF (silent live)' : 'AI voice on'}</span>
                </button>
                <button
                  type="button"
                  className={`live-cockpit-row${showCaptions ? ' is-engaged' : ''}`}
                  onClick={() => setShowCaptions(!showCaptions)}
                  aria-pressed={showCaptions}
                  title={showCaptions ? 'Hide captions' : 'Show captions'}
                >
                  <Captions size={16} />
                  <span>Captions</span>
                </button>
                {curProvider !== 'gemini' && (
                  <button
                    type="button"
                    className="live-cockpit-row"
                    onClick={handleVoiceEngineToggle}
                    title={liveEngine === 'system'
                      ? 'Voice: Fast System (0ms instant speech). Tap to switch to Neural HD.'
                      : 'Voice: Neural HD (Kokoro 82M on-device). Tap to switch to Fast System (0ms instant).'}
                  >
                    {liveEngine === 'system' ? <Zap size={16} /> : <Sparkles size={16} />}
                    <span>{liveEngine === 'system' ? 'Fast Voice (0ms)' : 'Neural HD'}</span>
                  </button>
                )}
              </section>

              <section className="live-cockpit-sheaf-section" aria-label="Call setup">
                <h3>Call setup</h3>
                <div className="live-ck-dropdowns">
        {/* Custom Glassmorphism Provider Dropdown */}
        {allProviders && Object.keys(allProviders).length > 0 ? (
          <div ref={providerDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              onClick={() => {
                setProviderDropdownOpen(v => !v)
                setModelDropdownOpen(false)
              }}
              className="live-badge provider-custom-btn"
              title="Switch AI Provider"
            >
              {/* Glowing Green Dot if current provider is ready */}
              <span
                className="live-ready-indicator"
                style={{ backgroundColor: isCurProviderReady ? '#22c55e' : 'rgba(148, 163, 184, 0.4)' }}
                title={isCurProviderReady ? 'API Key updated & ready' : 'Needs API Key'}
              />
              <span>{allProviders[curProvider]?.name || curProvider}</span>
              <ChevronDown
                size={11}
                className={`dropdown-icon ${providerDropdownOpen ? 'open' : ''}`}
              />
            </button>

            {/* Transparent Frosted Glass Dropdown Panel */}
            {providerDropdownOpen && (
              <div className="live-custom-dropdown-panel">
                <div className="live-custom-dropdown-header">
                  <span>Select Provider</span>
                  <span style={{ fontSize: '9px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} /> Ready
                  </span>
                </div>

                {Object.entries(allProviders).map(([pId, pData]) => {
                  const isReady = isProviderReady(pId, pData)
                  const isSelected = pId === curProvider
                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => {
                        handleProviderSelect(pId)
                        setProviderDropdownOpen(false)
                      }}
                      className={`live-dropdown-item-btn ${isSelected ? 'selected' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {/* Glowing green dot for providers who have API key updated and ready */}
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: isReady ? '#22c55e' : 'rgba(148, 163, 184, 0.3)',
                            flexShrink: 0,
                            display: 'inline-block',
                          }}
                          title={isReady ? 'API Key updated & ready' : 'Needs API Key'}
                        />
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {pData?.name || pId}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {!isReady && (
                          <span style={{ fontSize: '9px', opacity: 0.65 }}>
                            no key
                          </span>
                        )}
                        {isSelected && <Check size={12} style={{ color: 'var(--accent, #ff6b35)', flexShrink: 0 }} />}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <span className="live-badge provider">
            {curProvider}
          </span>
        )}

        {/* Custom Glassmorphism Model Dropdown */}
        <div ref={modelDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            onClick={() => {
              setModelDropdownOpen(v => !v)
              setProviderDropdownOpen(false)
            }}
            className="live-badge model-custom-btn"
            title="Change active model or search"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(activeProvider.model || model || '').split('/').pop()}
            </span>
            <ChevronDown
              size={11}
              className={`dropdown-icon ${modelDropdownOpen ? 'open' : ''}`}
            />
          </button>

          {/* Transparent Frosted Glass Dropdown Panel */}
          {modelDropdownOpen && (
            <div className="live-custom-dropdown-panel">
              {/* Auto-pick fastest model for live button */}
              <button
                type="button"
                onClick={() => {
                  setModelDropdownOpen(false)
                  handleAutoPickFastest()
                }}
                disabled={isAutoPickingFastest}
                className="live-dropdown-action-btn"
                style={{
                  background: 'rgba(34, 197, 94, 0.14)',
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  color: '#16a34a',
                }}
              >
                <Zap size={13} className={isAutoPickingFastest ? 'spin' : ''} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>{isAutoPickingFastest ? 'Testing Speed…' : '⚡ Auto-pick fastest for live'}</span>
              </button>

              {/* Search all models button */}
              <button
                type="button"
                onClick={() => {
                  setModelDropdownOpen(false)
                  setShowModelSearch(true)
                }}
                className="live-dropdown-action-btn"
              >
                <Search size={13} style={{ flexShrink: 0 }} />
                <span>🔍 Search all models…</span>
              </button>

              <div className="live-custom-dropdown-header">
                <span>{allProviders[curProvider]?.name || curProvider} Models</span>
              </div>

              {currentModels.map(m => {
                const isSelected = (activeProvider.model || model) === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      handleModelChange(m)
                      setModelDropdownOpen(false)
                    }}
                    className={`live-dropdown-item-btn ${isSelected ? 'selected' : ''}`}
                  >
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {m.split('/').pop()}
                    </span>
                    {isSelected && <Check size={12} style={{ color: 'var(--accent, #ff6b35)', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
                </div>

                {/* [live-redesign] View modes + theme — same handlers/labels as
                    the retired badges row; the artifacts chip moved to the
                    Panels & tools section above. */}
                <section
                  className="live-cockpit-sheaf-section"
                  role="group"
                  aria-label="View mode"
                  style={{ border: 0 }}
                >
                  <h3>View modes</h3>
                  <button
                    type="button"
                    className={`live-cockpit-row${viewMode === 'cinema' ? ' is-engaged' : ''}`}
                    onClick={() => setViewMode('cinema')}
                    title="Full Stage Cinema View"
                  >
                    <Maximize2 size={16} />
                    <span>Cinema</span>
                  </button>
                  <button
                    type="button"
                    className={`live-cockpit-row${viewMode === 'dock' ? ' is-engaged' : ''}`}
                    onClick={() => {
                      setViewMode('dock')
                      showHudNotice('Docked to dynamic island overlay')
                    }}
                    title="Dock to top Dynamic Island overlay while working in app"
                  >
                    <Layers size={16} />
                    <span>Dock</span>
                  </button>
                  {isDocumentPipSupported() && (
                    <button
                      type="button"
                      className={`live-cockpit-row${viewMode === 'pip' ? ' is-engaged' : ''}`}
                      onClick={handlePopoutPip}
                      title="Pop out into floating Desktop PiP Window"
                    >
                      <PictureInPicture2 size={16} />
                      <span>PiP window</span>
                    </button>
                  )}
                  {onToggleTheme && (
                    <button
                      type="button"
                      className="live-cockpit-row"
                      onClick={onToggleTheme}
                      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    >
                      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                      <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
                    </button>
                  )}
                </section>
              </section>

              {/* [live-step] Step-by-step mode strip — shows current step k/n,
                  the step text, and the voice hint. Only visible when a plan
                  is active. The five commands ("next", "done", "back",
                  "repeat", "what's left") are recognised on word boundaries
                  from the final transcript; the sheaf strip just mirrors state. */}
              {stepModeActive && stepPlan && (
                <section className="live-cockpit-sheaf-section" aria-label="Step-by-step mode">
                  <h3>Step-by-step</h3>
                  <div className="live-step-strip" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-2) 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--live-text-accent-info)' }}>
                        Step {stepLabel(stepPlan, stepState.index)?.k ?? 1} / {stepLabel(stepPlan, stepState.index)?.n ?? stepPlan.count}
                      </span>
                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--live-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stepLabel(stepPlan, stepState.index)?.text ?? ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                      {[
                        { cmd: 'back', label: '← Back', disabled: stepState.index <= 0 },
                        { cmd: 'repeat', label: '↻ Repeat', disabled: false },
                        { cmd: 'next', label: 'Next →', disabled: stepState.index >= (stepState.total - 1) },
                        { cmd: 'done', label: '✓ Done', disabled: false },
                        { cmd: 'remaining', label: '? Left', disabled: false },
                      ].map(({ cmd, label, disabled }) => (
                        <button
                          key={cmd}
                          type="button"
                          className="live-cockpit-row"
                          onClick={() => {
                            const { state, used, event } = dispatchStep(stepPlan, stepState, cmd)
                            if (used) {
                              setStepState(state)
                              if (event) {
                                if (event.type === 'advance') showHudNotice(`Step ${event.index + 1}/${stepState.total}: ${event.step}`)
                                else if (event.type === 'complete') { showHudNotice('Plan complete — all steps done'); setStepModeActive(false) }
                                else if (event.type === 'back') showHudNotice(`Back to step ${event.index + 1}: ${event.step}`)
                                else if (event.type === 'repeat') showHudNotice(`Repeat: ${event.step}`)
                                else if (event.type === 'remaining') showHudNotice(`Step ${event.index + 1} of ${event.total}, ${event.left} left`)
                              }
                            }
                          }}
                          disabled={disabled}
                          style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto', fontSize: '12px', padding: '4px 8px' }}
                          aria-pressed={false}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', opacity: 0.6, margin: 'var(--space-2) 0 0' }}>
                      {stepLabel(stepPlan, stepState.index)?.hint ?? ''}
                    </p>
                  </div>
                </section>
              )}

              {/* [live-offline] Fully-offline Live badge + toggle. The badge
                  tells exactly what's running (Ollama/WebLLM + Whisper + Kokoro
                  or system voice) and what's degraded (no web tools, no VLM,
                  slower WebLLM, system voice). Offline mode pins the session to
                  local-only and disables all cloud tools. */}
              <section className="live-cockpit-sheaf-section" aria-label="Offline Live">
                <h3>Offline Live</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-2) 0' }}>
                  <div style={{ fontSize: '12px', opacity: 0.8, lineHeight: 1.5 }}>
                    {offlineBadge || 'Run the readiness check to see if your device can go fully offline.'}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`live-cockpit-row${offlineMode ? ' is-engaged' : ''}`}
                      onClick={() => {
                        const next = !offlineMode
                        setOfflineMode(next)
                        if (next) {
                          const stack = computeOfflineBadge()
                          if (!stack.ready) {
                            showHudNotice(`⚠️ ${stack.nextStep || 'Not ready for offline'}`)
                            setOfflineMode(false)
                            return
                          }
                          // Recreate session with pinned offline stack
                          sessionRef.current?.stop?.()
                          showHudNotice('Reconnecting in fully-offline mode…')
                        } else {
                          sessionRef.current?.stop?.()
                          showHudNotice('Returning to cloud-assisted Live…')
                        }
                      }}
                      aria-pressed={offlineMode}
                      disabled={!offlineBadge || !computeOfflineBadge().ready}
                    >
                      {offlineMode ? <Brain size={16} style={{ color: '#22c55e' }} /> : <Brain size={16} />}
                      <span>{offlineMode ? 'Fully Offline' : 'Go Fully Offline'}</span>
                    </button>
                    <button
                      type="button"
                      className="live-cockpit-row"
                      onClick={computeOfflineBadge}
                      title="Re-check what's available locally"
                    >
                      <RefreshCw size={16} />
                      <span>Refresh readiness</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

      </div>

      {/* [live-redesign] Artifacts get their OWN rail instead of a drawer tab.
          Renders in cinema mode; the dock/PiP companions have their own
          mounts. Touch collapses this to an overlay card via CSS. */}
      {viewMode === 'cinema' && showArtifactStage && artifacts.length > 0 && (
        <aside id="live-artifact-rail" className="live-cockpit-rail" aria-label="Live artifacts" tabIndex={-1}>
          <LiveArtifactStage
            artifacts={artifacts}
            activeIndex={activeArtifactIdx}
            onSelectIndex={setActiveArtifactIdx}
            onClose={() => {
              setShowArtifactStage(false)
              commandBarFocusReturn()
            }}
          />
        </aside>
      )}

      {/* Center Stage: Mascot + Waveform + Active AI Response Card + Activity HUD */}
      <div className={`live-center-arena ${latestAssistantMsg?.text ? 'has-response' : ''}`}>
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

          {/* Single Unified Status Pill */}
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
              <span>🧠 Thinking</span>
              {uiState.thinkingStartTime && (
                <ActivityTimer startTime={uiState.thinkingStartTime} />
              )}
              {reasoningText && (
                <button
                  type="button"
                  className="live-view-reasoning-chip"
                  onClick={() => {
                    setShowLiveReasoning(prev => !prev)
                  }}
                  title="Toggle thinking process preview"
                >
                  {showLiveReasoning ? 'Hide thoughts' : 'View thoughts →'}
                </button>
              )}
              <button
                type="button"
                onClick={handleStopTurn}
                className="live-stop-turn-chip"
                title="Stop model thinking & cancel response"
              >
                <Square size={10} fill="currentColor" /> Stop
              </button>
            </div>
          )}
          {tool && (
            <div className="live-status tool-status">
              <Wrench size={14} className="spin" />
              <span>🔧 Using: <strong>{tool}</strong></span>
            </div>
          )}
          {liveStatusText && !thinking && !tool && (
            <div className="live-status action-status">
              {liveStatusText.includes('⏹') || liveStatusText.includes('Stopped') ? (
                <Square size={10} fill="currentColor" />
              ) : (
                <Loader2 size={13} className="spin" />
              )}
              <span>{liveStatusText}</span>
            </div>
          )}

          {/* [live-redesign] Latency SLO badge + text-fallback nudge moved to
              the top status strip — the stage center stays clean. */}
        </div>

        {/* Active AI Response Stage — Prominent on-screen card */}
        {(latestAssistantMsg?.text || (thinking && (reasoningText || uiState.thinkingStartTime))) && !responseMinimized && (
          <div className="live-center-response" role="region" aria-label="AI response">
            <div className="live-center-response-card">
              <div className="live-center-response-header">
                <div className="live-center-response-title">
                  <span className="live-center-response-badge">
                    <Bot size={13} />
                    <strong>{curProvider === 'gemini' ? 'Gemini Live' : (activeProvider?.model ? String(activeProvider.model).split('/').pop() : 'AI Response')}</strong>
                  </span>
                  {speaking && (
                    <span className="live-center-speaking-tag">
                      <Volume2 size={11} className="pulse" /> Speaking
                    </span>
                  )}
                  {thinking && (
                    <span className="live-center-thinking-tag">
                      <Brain size={11} /> Thinking
                      {uiState.thinkingStartTime && <ActivityTimer startTime={uiState.thinkingStartTime} />}
                    </span>
                  )}
                </div>

                <div className="live-center-response-actions">
                  {latestAssistantMsg?.text && (
                    <button
                      type="button"
                      className="live-center-action-btn"
                      onClick={() => handleCopyResponse(latestAssistantMsg.text)}
                      title="Copy response to clipboard"
                    >
                      {copiedResponse ? <Check size={13} style={{ color: '#4ade80' }} /> : <Copy size={13} />}
                      <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="live-center-action-btn"
                    onClick={() => setResponseMinimized(true)}
                    title="Minimize response card"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {/* Real-time reasoning accordion while thinking */}
              {reasoningText && (
                <div className="live-center-reasoning-drawer">
                  <button
                    type="button"
                    className="live-center-reasoning-toggle"
                    onClick={() => setShowLiveReasoning(prev => !prev)}
                  >
                    <Brain size={12} />
                    <span>{showLiveReasoning ? 'Hide internal reasoning' : 'View internal reasoning'}</span>
                    <ChevronDown size={12} style={{ transform: showLiveReasoning ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  {showLiveReasoning && (
                    <pre className="live-center-reasoning-body">{reasoningText}</pre>
                  )}
                </div>
              )}

              {/* Formatted Markdown Content */}
              {latestAssistantMsg?.text ? (
                <div
                  className="live-center-response-body prose"
                  ref={centerResponseRef}
                  onScroll={(e) => {
                    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
                    setUserScrolledResponse(scrollHeight - scrollTop - clientHeight > 40)
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" className="live-center-link" />
                      )
                    }}
                  >
                    {latestAssistantMsg.text}
                  </ReactMarkdown>
                </div>
              ) : thinking ? (
                <div className="live-center-response-placeholder">
                  <span className="thinking-dots"><span /><span /><span /></span>
                  <span>Formulating comprehensive response…</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Minimized Pill Toggle if user collapsed the card */}
        {latestAssistantMsg?.text && responseMinimized && (
          <button
            type="button"
            className="live-center-minimized-chip"
            onClick={() => setResponseMinimized(false)}
            title="Expand AI response"
          >
            <Bot size={13} />
            <span>Show on-screen answer</span>
            <ChevronUp size={13} />
          </button>
        )}
      </div>

      {/* Floating non-blocking toast banner — NEVER closes live */}
      {error && (
        <div className="live-toast-banner" role="alert">
          <AlertTriangle size={16} className="live-toast-icon" />
          <span className="live-toast-msg">{error}</span>
          <button
            type="button"
            className="live-toast-close"
            onClick={() => {
              if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
              setState({ error: '' })
            }}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live subtitle capsule — sleek, rolling phrase when response card is minimized or before response exists */}
      {showCaptions && (responseMinimized || !latestAssistantMsg?.text) && lines.length > 0 && lines[lines.length - 1]?.text && (
        <div className="live-captions-capsule" aria-live="polite">
          <div className={`live-caption-pill ${lines[lines.length - 1].role}`}>
            <span className="caption-tag">
              {lines[lines.length - 1].role === 'user' ? '🎙️ You' : '🤖 AI'}
            </span>
            <span className="caption-text">
              {lines[lines.length - 1].role === 'assistant'
                ? formatRollingCaption(lines[lines.length - 1].text)
                : lines[lines.length - 1].text}
            </span>
          </div>
        </div>
      )}

      {/* HUD Transient Status Notice */}
      {hudNotice && (
        <div className="live-hud-notice" role="status" aria-live="polite">
          {hudNotice}
        </div>
      )}

      {/* Shutter Camera Flash Effect */}
      {shutterFlash && <div className="live-shutter-flash" aria-hidden="true" />}

      {/* [live-redesign] Bottom command bar — the ONE place the call is driven
          from: mic, camera, screen, stop (when the model is active), end, and
          the ⋯ hub that opens the sheaf. Everything else moved to the sheaf or
          the status strip. `live-cb-btn` is a fresh class so the legacy 32px
          `.live-btn` sizing can never fight it. Token-driven in
          13-live-components.css. */}
      <div className="live-cockpit-bar" role="group" aria-label="Live call controls">
        <button
          type="button"
          className={`live-cb-btn is-mic${muted ? ' is-off' : ''}`}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          title={muted ? 'Microphone muted — tap to unmute' : 'Mute microphone'}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
          <span className="live-cb-label" aria-hidden="true">{muted ? 'Mic off' : 'Mic'}</span>
        </button>
        <button
          type="button"
          className={`live-cb-btn is-cam${camOn ? ' is-engaged' : ''}`}
          onClick={toggleCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          title={camOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          <span className="live-cb-label" aria-hidden="true">Cam</span>
        </button>
        <button
          type="button"
          className={`live-cb-btn is-screen${screenOn ? ' is-engaged' : ''}`}
          onClick={toggleScreen}
          aria-label={screenOn ? 'Stop screen sharing' : 'Share screen'}
          title={screenOn ? 'Stop sharing screen' : 'Share screen with AI'}
        >
          {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
          <span className="live-cb-label" aria-hidden="true">{screenOn ? 'Sharing' : 'Screen'}</span>
        </button>
        {/* [live-capture] Torch: the low-light fix, shown only when the active
            camera track honestly reports torch support (mobile rear cameras,
            mostly). Same is-engaged state language as the other primaries. */}
        {camOn && torchReady && (
          <button
            type="button"
            className={`live-cb-btn is-torch${torchOn ? ' is-engaged' : ''}`}
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            aria-pressed={torchOn}
            title={torchOn ? 'Turn off the torch' : 'Light the scene so the AI can see it'}
          >
            <Flashlight size={18} />
            <span className="live-cb-label" aria-hidden="true">Torch</span>
          </button>
        )}
        {(thinking || speaking) && (
          <button
            type="button"
            className="live-cb-btn is-stop"
            onClick={handleStopTurn}
            aria-label="Stop response"
            title="Stop AI response"
          >
            <Square size={16} fill="currentColor" />
            <span className="live-cb-label" aria-hidden="true">Stop</span>
          </button>
        )}
        <button
          type="button"
          className="live-cb-btn is-end"
          onClick={() => setEndConfirm(true)}
          aria-label="End call"
          title="End call"
        >
          <PhoneOff size={18} />
          <span className="live-cb-label" aria-hidden="true">End</span>
        </button>

        {/* The hub — opens the "more" sheaf (aria-expanded + aria-controls).
            Re-focuses the hub whenever the sheaf closes, per the a11y
            contract. The live-btn-badge chips the artifact count. */}
        <button
          type="button"
          ref={sheafHubRef}
          className={`live-cb-btn is-hub${sheafOpen ? ' is-open' : ''}`}
          onClick={toggleCockpitSheaf}
          aria-label={sheafOpen ? 'Close more controls' : 'More live controls'}
          aria-haspopup="dialog"
          aria-expanded={sheafOpen}
          aria-controls="live-cockpit-sheaf"
          title={sheafOpen ? 'Close more controls' : 'More controls'}
          style={{ position: 'relative' }}
        >
          <MoreVertical size={18} />
          <span className="live-cb-label" aria-hidden="true">More</span>
          {artifacts.length > 0 && <span className="live-btn-badge">{artifacts.length}</span>}
        </button>
      </div>

      {/* [live-redesign] Transcript drawer — pure transcript surface. It takes
          `live-transcript-drawer` (role=article/complementary inside the
          component) and, once rewritten, has no artifact tab: artifacts dock
          LIVE in `#live-cockpit-rail` (sheaf aside) instead. Closing the
          drawer returns focus to the command-bar hub. */}
      <LiveTranscriptPanel
        isOpen={showTranscript}
        onClose={() => {
          setState(prev => ({ ...prev, showTranscript: false }))
          commandBarFocusReturn()
        }}
        transcript={transcript}
        activeTool={tool}
        isThinking={thinking}
        thinkingStartTime={uiState.thinkingStartTime}
        liveStatusText={liveStatusText}
        onCopy={copyText}
        copiedIdx={copiedIdx}
        formatTime={formatTime}
        features={features}
        activeProvider={activeProvider.provider || provider}
        activeModel={activeProvider.model || model}
        artifacts={artifacts}
        activeArtifactIdx={activeArtifactIdx}
        onSelectArtifactIndex={setActiveArtifactIdx}
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

      {/* Dedicated Search AI Model Modal */}
      <LiveModelSearchModal
        open={showModelSearch}
        onClose={() => setShowModelSearch(false)}
        allProviders={allProviders}
        keyInfo={keyInfo}
        activeProvider={activeProvider.provider || provider}
        activeModel={activeProvider.model || model}
        onSelectModel={handlePickModelFromSearch}
      />

      {/* [live-recording] Playback overlay — opened from the sheaf's recordings
          panel. Escape unwinds it like every other Live modal. */}
      {playingRecording && (
        <div
          className="vision-modal-overlay"
          style={{ zIndex: 510 }}
          onClick={(e) => { if (e.target === e.currentTarget) setPlayingRecording(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setPlayingRecording(null) }}
        >
          <LiveRecordingPlayer recording={playingRecording} onClose={() => setPlayingRecording(null)} />
        </div>
      )}
      {/* [live-recording] Post-call recap card — Horizon-1 item 4. Shown in
          Live at call end; the deferred handoff runs when it closes. */}
      {recapCard && (
        <LiveRecapCard
          recap={recapCard}
          onSave={handleRecapSave}
          onClose={handleRecapClose}
        />
      )}
      {/* ─── End-call confirmation modal ─── */}
      {endConfirm && (
        <div
          className="vision-modal-overlay"
          style={{ zIndex: 500 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEndConfirm(false) }}
        >
          <div style={{
            background: 'var(--live-modal-bg, rgba(20,24,34,.96))',
            border: '1px solid var(--live-modal-border, rgba(255,255,255,.12))',
            borderRadius: 20,
            padding: '32px 28px 24px',
            width: 'min(340px, 88vw)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,.45)',
            animation: 'vision-slide-up .25s cubic-bezier(.16,1,.3,1)',
          }}>
            {/* Orange phone-off icon */}
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--accent-gradient, linear-gradient(135deg,#ff6b35,#f7c948))',
              display: 'grid', placeItems: 'center',
              boxShadow: '0 0 28px var(--accent-glow, rgba(255,107,53,.4))',
            }}>
              <PhoneOff size={26} color="#fff" />
            </div>
            <h3 style={{
              margin: 0, fontSize: 17, fontWeight: 700,
              color: 'var(--live-text, #fff)',
            }}>End this session?</h3>
            <p style={{
              margin: 0, fontSize: 13, lineHeight: 1.55,
              color: 'var(--live-text-dim, rgba(255,255,255,.6))',
            }}>
              The conversation will be saved as a recap in your chat. You can start a new Live session anytime.
            </p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
              <button
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12,
                  background: 'var(--live-surface, rgba(255,255,255,.07))',
                  border: '1px solid var(--live-border, rgba(255,255,255,.12))',
                  color: 'var(--live-text, #fff)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onClick={() => setEndConfirm(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12,
                  background: 'var(--accent-gradient, linear-gradient(135deg,#ff6b35,#f7c948))',
                  border: 'none',
                  color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 16px var(--accent-glow, rgba(255,107,53,.35))',
                  transition: 'filter .15s',
                }}
                onClick={() => { setEndConfirm(false); handleEnd() }}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
