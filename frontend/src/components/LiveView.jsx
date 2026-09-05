import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench,
  AlertTriangle, Monitor, MonitorOff, MessageSquare, Eye, EyeOff,
  Aperture, Volume2, VolumeX, Scan, ScanEye,
  RefreshCw, SwitchCamera, Settings2, Camera, Search,
  ChevronDown, Check, Zap, Layers, PictureInPicture2, Maximize2,
} from 'lucide-react'
import { autoPickModel } from '../api'
import { runAgent } from '../agent'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'
import { formatLiveSessionRecap } from '../live/sessionHandoff'
import { captureProfile, describeWithoutModel, getSharedVisualSource, needsMotion } from '../vision/source'
import { detectObjects } from '../vision/detect'
import { temporalVideoBuffer } from '../vision/temporalBuffer'
import { buzz } from '../features'
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
import { db, getSetting, setSetting } from '../db'
import { preconnectProvider } from '../live/latencyOptimizer'
import { backgroundWorkers } from '../backgroundWorkers'

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
    // AI voice OUTPUT, separate from `muted` (the mic). Previously there was
    // no way to turn the assistant's speaking off without also turning off
    // listening.
    speakerMuted: false,
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
  const [liveEngine, setLiveEngine] = useState(voiceEngine || 'neural')
  const [showCaptions, setShowCaptions] = useState(features.liveCaptions !== false)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [hasFlip, setHasFlip] = useState(false)
  const [viewMode, setViewMode] = useState('cinema') // 'cinema' | 'dock' | 'pip'
  const [artifacts, setArtifacts] = useState([])
  const [activeArtifactIdx, setActiveArtifactIdx] = useState(0)
  const [showArtifactStage, setShowArtifactStage] = useState(true)
  const [pipRoot, setPipRoot] = useState(null)

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

  // Destructure for convenience in render
  const {
    state, error, muted, speakerMuted, camOn, screenOn, visionMode, speaking, thinking, tool,
    liveStatusText, reasoningText, showReasoning,
    lines, transcript, showTranscript, copiedIdx, frameSent, liveVoice,
    activeProvider, connectionState, userLevel, assistantLevel, breathingPhase,
  } = uiState

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
          streaming: true,
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
  }, [onTranscript])

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

  const handleProviderSelect = useCallback((newProvider) => {
    if (!newProvider || newProvider === (activeProvider.provider || provider)) return
    const provModels = allProviders[newProvider]?.models || []
    const newModel = provModels[0] || ''
    setState(prev => ({
      ...prev,
      activeProvider: { provider: newProvider, model: newModel }
    }))
    sessionRef.current?.setProvider?.(newProvider, undefined, newModel, modelCanSee)
    onProviderChange?.(newProvider, newModel)
    showHudNotice(`Provider: ${allProviders[newProvider]?.name || newProvider}`)
  }, [activeProvider.provider, provider, allProviders, modelCanSee, onProviderChange, showHudNotice])

  const handlePickModelFromSearch = useCallback((targetProvider, targetModel) => {
    if (!targetModel) return
    const isDiffProv = targetProvider && targetProvider !== (activeProvider.provider || provider)
    setState(prev => ({
      ...prev,
      activeProvider: { provider: targetProvider || activeProvider.provider || provider, model: targetModel }
    }))
    if (isDiffProv) {
      sessionRef.current?.setProvider?.(targetProvider, undefined, targetModel, modelCanSee)
      onProviderChange?.(targetProvider, targetModel)
    } else {
      sessionRef.current?.setModel?.(targetModel, modelCanSee)
      onModelChange?.(targetModel)
    }
    showHudNotice(`Model: ${targetModel.split('/').pop().slice(0, 24)}`)
  }, [activeProvider.provider, provider, modelCanSee, onProviderChange, onModelChange, showHudNotice])

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
      persona, disabledTools, modelCanSee, camera: false, noiseSuppression,
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
          case 'status':
            setState(prev => ({
              ...prev,
              liveStatusText: e.text,
              transcript: [...prev.transcript, { type: 'status', text: e.text, time: Date.now() }],
            }))
            break
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
    showHudNotice(next === 'always' ? '👁️ Continuous Vision: AI inspects feed every turn' : '👁️ Look When Asked: On-demand visual inspection')
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

    try {
      if (modelCanSee) {
        setVision({ via: model ? model.split('/').pop() : provider })
        const isMotionQ = needsMotion(q)
        const userMessage = (isMotionQ && temporalVideoBuffer.hasFrames())
          ? temporalVideoBuffer.buildMultimodalPrompt(q, 3)
          : [
              { type: 'text', text: q },
              { type: 'image_url', image_url: { url: dataUrl } },
            ]
        await runAgent({
          provider, apiKey, model,
          userMessage,
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
    <div className={`live-view ${viewMode === 'dock' ? 'mode-dock' : ''}`} role="dialog" aria-modal="true" aria-label="Live conversation">
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

      <video ref={videoRef} className={`live-self ${camOn ? '' : 'off'}`} autoPlay playsInline muted />
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
      {/* The Identify Pill / Scan Barcode / Enhance Macro shortcut bar (LiveHudOverlay)
          was removed 2026-09-04: it pre-empted the model by capturing the frame and
          acting the instant the button was tapped, whether or not the user had asked
          for that specific job. Saying "identify this pill" (or scan/enhance) out loud
          or in the composer reaches the model through the normal turn — vision is
          already attached per-turn (visualParts/describeIfVisual above) — so nothing
          is lost, it just now requires an actual user command instead of a standing
          button guessing what they want. See buildGuards.test.js's orphan allowlist
          for LiveHudOverlay.jsx. */}

      {/* Live Spatial Artifact Stage Drawer (Cinema mode) */}
      {viewMode === 'cinema' && artifacts.length > 0 && showArtifactStage && (
        <div
          className="live-spatial-artifact-drawer"
          style={{
            position: 'absolute',
            right: '20px',
            top: '68px',
            bottom: '100px',
            width: 'min(480px, calc(100vw - 40px))',
            zIndex: 25,
          }}
        >
          <LiveArtifactStage
            artifacts={artifacts}
            activeIndex={activeArtifactIdx}
            onSelectIndex={setActiveArtifactIdx}
            onClose={() => setShowArtifactStage(false)}
          />
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
          // Gemini fixes the voice at setup and REFUSES this. Only move the
          // control once the engine accepted it, or the UI shows a choice that
          // did not happen.
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
        // Cascade listens through the Web Speech API, which picks the mic
        // itself and accepts no deviceId. Showing a mic list there would be a
        // picker that silently does nothing.
        micSwitchable={engine === 'gemini'}
      />

      {/* Awareness badges — provider/model & View Mode Switcher */}
      <div className="live-badges">
        {/* View Mode Switcher: Cinema | Companion Dock | PiP Window */}
        <div className="live-mode-switch-group" role="group" aria-label="View mode">
          <button
            type="button"
            className={`live-mode-switch-btn ${viewMode === 'cinema' ? 'active' : ''}`}
            onClick={() => setViewMode('cinema')}
            title="Full Stage Cinema View"
          >
            <Maximize2 size={12} />
            <span>Cinema</span>
          </button>
          <button
            type="button"
            className={`live-mode-switch-btn ${viewMode === 'dock' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('dock')
              showHudNotice('Docked to dynamic island overlay')
            }}
            title="Dock to top Dynamic Island overlay while working in app"
          >
            <Layers size={12} />
            <span>Dock</span>
          </button>
          {isDocumentPipSupported() && (
            <button
              type="button"
              className={`live-mode-switch-btn ${viewMode === 'pip' ? 'active' : ''}`}
              onClick={handlePopoutPip}
              title="Pop out into floating Desktop PiP Window"
            >
              <PictureInPicture2 size={12} />
              <span>PiP</span>
            </button>
          )}
          {artifacts.length > 0 && (
            <button
              type="button"
              className={`live-mode-switch-btn ${showArtifactStage ? 'active' : ''}`}
              onClick={() => setShowArtifactStage(v => !v)}
              title="Toggle Live Spatial Artifact Stage"
            >
              <Layers size={12} style={{ color: '#38bdf8' }} />
              <span>Artifacts ({artifacts.length})</span>
            </button>
          )}
        </div>
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
              style={{
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                color: '#38bdf8',
                border: providerDropdownOpen
                  ? '1px solid rgba(56, 189, 248, 0.6)'
                  : '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                transition: 'all 0.15s ease',
              }}
              title="Switch AI Provider"
            >
              {/* Glowing Green Dot if current provider is ready */}
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: isCurProviderReady ? '#22c55e' : 'rgba(148, 163, 184, 0.4)',
                  boxShadow: isCurProviderReady ? '0 0 8px #22c55e, 0 0 2px #4ade80' : 'none',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
                title={isCurProviderReady ? 'API Key updated & ready' : 'Needs API Key'}
              />
              <span>{allProviders[curProvider]?.name || curProvider}</span>
              <ChevronDown
                size={11}
                style={{
                  opacity: 0.7,
                  transform: providerDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>

            {/* Transparent Frosted Glass Dropdown Panel */}
            {providerDropdownOpen && (
              <div
                className="live-custom-dropdown-panel"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '230px',
                  maxWidth: '300px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  background: 'rgba(10, 16, 30, 0.68)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '14px',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.12)',
                  padding: '5px',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  animation: 'liveFadeIn 0.12s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '6px 10px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'rgba(148, 163, 184, 0.7)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    marginBottom: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                        border: isSelected ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                        color: isSelected ? '#38bdf8' : '#f1f5f9',
                        fontSize: '12px',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {/* Glowing green dot for providers who have API key updated and ready */}
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: isReady ? '#22c55e' : 'rgba(148, 163, 184, 0.3)',
                            boxShadow: isReady ? '0 0 8px #22c55e, 0 0 2px #4ade80' : 'none',
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
                          <span style={{ fontSize: '9px', color: '#94a3b8', opacity: 0.65 }}>
                            no key
                          </span>
                        )}
                        {isSelected && <Check size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />}
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
            style={{
              background: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: '#f1f5f9',
              border: modelDropdownOpen
                ? '1px solid rgba(255, 255, 255, 0.35)'
                : '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '3px 10px',
              fontSize: '11px',
              cursor: 'pointer',
              height: '24px',
              maxWidth: '220px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.15s ease',
            }}
            title="Change active model or search"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(activeProvider.model || model || '').split('/').pop()}
            </span>
            <ChevronDown
              size={11}
              style={{
                opacity: 0.7,
                transform: modelDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
                flexShrink: 0,
              }}
            />
          </button>

          {/* Transparent Frosted Glass Dropdown Panel */}
          {modelDropdownOpen && (
            <div
              className="live-custom-dropdown-panel"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                minWidth: '240px',
                maxWidth: '320px',
                maxHeight: '340px',
                overflowY: 'auto',
                background: 'rgba(10, 16, 30, 0.68)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '14px',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.12)',
                padding: '5px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                animation: 'liveFadeIn 0.12s ease-out',
              }}
            >
              {/* Auto-pick fastest model for live button */}
              <button
                type="button"
                onClick={() => {
                  setModelDropdownOpen(false)
                  handleAutoPickFastest()
                }}
                disabled={isAutoPickingFastest}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(34, 197, 94, 0.18)',
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  color: '#4ade80',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isAutoPickingFastest ? 'wait' : 'pointer',
                  textAlign: 'left',
                  marginBottom: '2px',
                  transition: 'all 0.1s ease',
                }}
              >
                <Zap size={13} className={isAutoPickingFastest ? 'spin' : ''} style={{ color: '#4ade80', flexShrink: 0 }} />
                <span>{isAutoPickingFastest ? 'Testing Speed…' : '⚡ Auto-pick fastest for live'}</span>
              </button>

              {/* Search all models button */}
              <button
                type="button"
                onClick={() => {
                  setModelDropdownOpen(false)
                  setShowModelSearch(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: '4px',
                  transition: 'all 0.1s ease',
                }}
              >
                <Search size={13} style={{ flexShrink: 0 }} />
                <span>🔍 Search all models…</span>
              </button>

              <div
                style={{
                  padding: '4px 10px 2px',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'rgba(148, 163, 184, 0.7)',
                }}
              >
                {allProviders[curProvider]?.name || curProvider} Models
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                      border: isSelected ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
                      color: isSelected ? '#fff' : '#cbd5e1',
                      fontSize: '12px',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.1s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {m.split('/').pop()}
                    </span>
                    {isSelected && <Check size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ⚡ Auto Pick Fastest Model Button */}
        <button
          type="button"
          onClick={handleAutoPickFastest}
          disabled={isAutoPickingFastest}
          className="live-badge fastest-badge"
          style={{
            background: isAutoPickingFastest ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.14)',
            color: '#4ade80',
            border: '1px solid rgba(74, 222, 128, 0.35)',
            borderRadius: '12px',
            padding: '2px 9px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: isAutoPickingFastest ? 'wait' : 'pointer',
            maxHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 2px 8px rgba(34, 197, 94, 0.15)',
            transition: 'all 0.15s ease',
          }}
          title="Auto-select the fastest, lowest-latency model for instant voice responses"
        >
          <Zap size={11} className={isAutoPickingFastest ? 'spin' : ''} style={{ color: '#4ade80' }} />
          <span>{isAutoPickingFastest ? 'Testing Speed…' : '⚡ Auto-Pick Fastest'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowModelSearch(true)}
          className="live-badge search-badge"
          style={{
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            maxHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Search all AI models across all providers"
        >
          <Search size={11} /> Search Model
        </button>
        {screenOn && <span className="live-badge screen-badge"><Monitor size={12} /> Screen</span>}
        {visionMode === 'always' && (
          <span className="live-badge watching-badge" title="AI inspects camera feed on every turn">
            <Eye size={12} /> Watching Live
          </span>
        )}
        {autoScan && (
          <span className="live-badge autoscan-badge" title="Auto-scan capturing feed every 10s">
            <Scan size={12} /> Auto-Scan 10s
          </span>
        )}
        {objectDetect && (
          <span className="live-badge detect-badge" title="On-device neural object detection HUD">
            <ScanEye size={12} /> Object HUD {detections.length > 0 ? `(${detections.length})` : ''}
          </span>
        )}
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
          <div className="live-status thinking-status" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(96, 165, 250, 0.35)',
            borderRadius: '12px',
            padding: '8px 16px',
            color: '#93c5fd',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            <span className="thinking-dots"><span /><span /><span /></span>
            🧠 Thinking
            {uiState.thinkingStartTime && (
              <ActivityTimer startTime={uiState.thinkingStartTime} />
            )}
          </div>
        )}
        {tool && (
          <div className="live-status" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            borderRadius: '12px',
            padding: '8px 16px',
            color: '#c7d2fe',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            <Wrench size={14} style={{ animation: 'spin 2s linear infinite' }} />
            🔧 Using: <strong style={{ color: '#e0e7ff' }}>{tool}</strong>
          </div>
        )}
        {liveStatusText && !thinking && !tool && (
          <div className="live-status action-status" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '7px 14px',
            color: '#7dd3fc',
            fontSize: '12px',
            fontWeight: 500,
            maxWidth: '90vw',
          }}>
            <Loader2 size={13} className="spin" />
            {liveStatusText}
          </div>
        )}

        {reasoningText && (
          <div
            className="live-reasoning-chip"
            style={{
              maxWidth: '90vw',
              width: '420px',
              margin: '8px auto 0',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '12px',
              padding: '8px 12px',
              textAlign: 'left',
              color: '#cbd5e1',
              fontSize: '12px',
              maxHeight: showReasoning ? '180px' : '48px',
              overflowY: 'auto',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              zIndex: 10,
            }}
            onClick={() => setState(prev => ({ ...prev, showReasoning: !prev.showReasoning }))}
            title="Click to toggle AI reasoning scratchpad"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600, color: '#93c5fd' }}>
              <span>🧠 AI Reasoning {thinking ? '(In Progress…)' : ''}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>{showReasoning ? '▲ Collapse' : '▼ View full'}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11px', opacity: 0.9 }}>
              {showReasoning ? reasoningText : (reasoningText.slice(-120) + '…')}
            </div>
          </div>
        )}

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

      {/* Live captions — only render when there is text to show, never an empty dark box */}
      {showCaptions && lines.length > 0 && (
        <div className="live-captions" aria-live="polite">
          {lines.map((l, i) => (
            <p key={i} className={`live-caption ${l.role}`}>
              <span>{l.text}</span>
            </p>
          ))}
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

      {/* Controls */}
      <div className="live-controls">
        <button
          className={`live-btn ${muted ? 'muted-btn' : ''}`}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          title={muted ? 'Microphone muted — tap to unmute' : 'Mute microphone'}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          className={`live-btn ${speakerMuted ? 'muted-btn' : ''}`}
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
          title={screenOn ? 'Stop sharing screen' : 'Share screen with AI'}
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
          aria-label="Switch camera and microphone"
          title="Switch camera & microphone"
        >
          <Camera size={20} />
        </button>
        <button
          className={`live-btn${modelCanSee ? '' : ' warn'}`}
          onClick={() => setShowSettings(true)}
          aria-label="Live settings"
          title={modelCanSee ? 'Live settings' : 'Live settings — this model cannot see images'}
        >
          <Settings2 size={20} />
        </button>
        <button className="live-btn end" onClick={() => setEndConfirm(true)} aria-label="End call" title="End call">
          <PhoneOff size={22} />
        </button>
        <button
          className={`live-btn ${camOn ? '' : 'muted-btn'}`}
          onClick={toggleCam}
          aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          title={camOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {camOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
        <button
          className={`live-btn vision-btn snapshot-btn`}
          onClick={openVision}
          disabled={(!camOn && !screenOn) || visionLoading}
          aria-label="Capture snapshot & ask AI"
          title="Capture snapshot & ask AI (instant scene analysis)"
        >
          <Aperture size={22} />
        </button>
        <button
          className={`live-btn vision-btn ${visionMode === 'always' ? 'active-vision' : ''}`}
          onClick={toggleVision}
          disabled={!camOn && !screenOn}
          aria-label={visionMode === 'always' ? 'Stop watching every turn' : 'Watch every turn'}
          title={visionMode === 'always'
            ? 'Watching every turn — AI sees camera feed continuously. Tap for look-when-asked.'
            : 'Look-when-asked. Tap to watch every turn (AI sees camera feed continuously).'}
        >
          {visionMode === 'always' ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
        <button
          className={`live-btn vision-btn ${autoScan ? 'active-autoscan' : ''}`}
          onClick={toggleAutoScan}
          disabled={!camOn && !screenOn}
          aria-label={autoScan ? 'Disable Auto-Scan' : 'Enable Auto-Scan'}
          title={autoScan ? 'Auto-Scan Active (Captures feed every 10s)' : 'Enable Auto-Scan (Periodic 10s visual inspection)'}
        >
          <Scan size={20} />
        </button>
        <button
          className={`live-btn vision-btn ${objectDetect ? 'active-detect' : ''}`}
          onClick={toggleObjectDetect}
          disabled={!camOn && !screenOn}
          aria-label={objectDetect ? 'Turn off object detection' : 'Turn on object detection'}
          title={detectError
            ? `Object detection: ${detectError}`
            : (objectDetect ? 'Object Detection HUD Active (On-device DETR boxes)' : 'Enable Object Detection HUD (Sci-fi target bounding boxes)')}
        >
          <ScanEye size={20} />
        </button>
        <button
          className={`live-btn transcript-toggle ${showTranscript ? 'active-transcript' : ''}`}
          onClick={() => setState({ showTranscript: !showTranscript })}
          aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
          title="Transcript & conversation history"
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* Transcript Panel - using extracted component */}
      <LiveTranscriptPanel
        isOpen={showTranscript}
        onClose={() => setState({ showTranscript: false })}
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