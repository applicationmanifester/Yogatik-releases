import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench,
  AlertTriangle, Monitor, MonitorOff, MessageSquare, Eye, EyeOff,
  Aperture, Volume2, Scan,
  RefreshCw,
} from 'lucide-react'
import { runAgent } from '../agent'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'
import { captureProfile, describeWithoutModel } from '../vision/source'
import { buzz } from '../features'
import { VisionModal } from './VisionModal'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'

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
    camOn: true,
    screenOn: false,
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
  })

  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const turnRef = useRef({ role: null, text: '' })
  const transcriptEndRef = useRef(null)
  const frameTimerRef = useRef(null)

  // Destructure for convenience in render
  const {
    state, error, muted, camOn, screenOn, speaking, thinking, tool,
    lines, transcript, showTranscript, copiedIdx, frameSent, liveVoice,
    activeProvider, connectionState, userLevel, assistantLevel, breathingPhase,
  } = uiState

  const {
    visionOpen, visionImage, visionText, visionLoading, visionQ, visionVia,
    autoScan, retakeFlash,
  } = visionState

  const setState = (updater) => setUiState(prev => ({
    ...prev,
    ...(typeof updater === 'function' ? updater(prev) : updater)
  }))
  const setVision = (updater) => setVisionState(prev => ({
    ...prev,
    ...(typeof updater === 'function' ? updater(prev) : updater)
  }))

  /** Transcript deltas arrive fragmented; merge into the current speaker's line. */
  const pushDelta = useCallback((role, text) => {
    // Captions (last 6 lines)
    setState((prev) => {
      const lines = [...prev.lines]
      const last = lines[lines.length - 1]
      if (last && last.role === role) {
        lines[lines.length - 1] = { role, text: last.text + text }
      } else {
        lines.push({ role, text })
      }
      return { ...prev, lines: lines.slice(-6) }
    })
    // Full transcript
    setState((prev) => {
      const transcript = [...prev.transcript]
      const last = transcript[transcript.length - 1]
      if (last && last.role === role && last.type === 'message') {
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
      if (e.key === 'Escape') setVision({ open: false })
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askVision(visionState.q) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visionState.open, visionState.q])

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
    const make = engine === 'gemini' ? createLiveSession : createCascadeSession
    const session = make({
      provider, apiKey, model, voice, voiceEngine, fallbacks,
      persona, disabledTools, modelCanSee, camera: true,
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
            setState({ tool: e.names.join(', ') })
            setState({ transcript: [...uiState.transcript, { type: 'tool', name: e.names.join(', '), time: Date.now() }] })
            break
          case 'toolResult': {
            setState({ tool: null })
            // Keep the raw result object so images/videos/files/code render richly.
            setState({ transcript: [...uiState.transcript, {
              type: 'toolResult', name: e.name, time: Date.now(), result: e.result,
            }] })
            // Surface generated media: open the panel so the user sees it.
            const r = e.result
            if (r && typeof r === 'object' &&
                (r.image_url || r.url || r.video_url || r.media_id || r.audio_url || r.exported_text || r.images)) {
              setState({ showTranscript: true })
            }
            break
          }
          case 'voice': setState({ liveVoice: e.engine }); break
          case 'provider': setState({ activeProvider: { provider: e.provider, model: e.model } }); break
          case 'reconnecting':
            setState({ connectionState: 'reconnecting', state: 'connecting' })
            break
          case 'error': setState({ error: e.message, state: 'error', connectionState: 'failed' }); break
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

  const toggleMute = () => {
    const v = !muted
    setState({ muted: v })
    sessionRef.current?.setMuted(v)
    // Haptic on mobile
    buzz(features, 30)
  }
  const toggleCam = async () => {
    const v = !camOn
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

  /** Hand the question to the call itself, so the answer lands in context. */
  const askInCall = () => {
    const q = visionQ.trim()
    if (!q) return
    sessionRef.current?.sendText(q)
    setVision({ open: false })
  }

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

      {/* Awareness badges */}
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
                {modelCanSeeMap[m] && <span className="badge-icon" title="Vision"> 👁</span>}
                {toolCapableModels.includes(m) && <span className="badge-icon" title="Tools"> 🔧</span>}
                {m === (activeProvider.model || model) && <span className="check"> ✓</span>}
              </option>
            ))}
          </select>
        ) : (
          <span className="live-badge provider">
            {activeProvider.provider}
            {activeProvider.model ? ` · ${activeProvider.model.split('/').pop().slice(0, 20)}` : ''}
          </span>
        )}
        {liveVoice === 'loading' && (
          <span className="live-badge awareness voice-loading">
            <Loader2 size={12} className="spin" /> Neural voice loading…
          </span>
        )}
        {liveVoice !== 'system' && liveVoice !== 'loading' && (
          <span className="live-badge awareness" title="On-device neural voice">
            <Volume2 size={12} /> Neural voice
          </span>
        )}
        <span className={`live-badge awareness ${(camOn || screenOn) && modelCanSee ? 'watching' : 'audio-only'}`}>
          {(camOn || screenOn) && modelCanSee ? (
            <><Eye size={12} /> Watching</>
          ) : (
            <><EyeOff size={12} /> Audio only</>
          )}
          {frameSent && (camOn || screenOn) && <span className="frame-dot" />}
        </span>
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
          <button className="btn" onClick={onEnd}>Close</button>
        </div>
      )}

      {/* Live captions */}
      {features.liveCaptions !== false && <div className="live-captions" aria-live="polite">
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
          className={`live-btn ${screenOn ? 'active-screen' : ''}`}
          onClick={toggleScreen}
          aria-label={screenOn ? 'Stop screen sharing' : 'Share screen'}
        >
          {screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />}
        </button>
        <button className="live-btn end" onClick={onEnd} aria-label="End call">
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
          className={`live-btn ${autoScan ? 'active-autoscan' : 'off'}`}
          onClick={() => setVision({ autoScan: !autoScan })}
          disabled={!camOn && !screenOn}
          aria-label={autoScan ? 'Disable Auto-Scan' : 'Enable Auto-Scan'}
          title={autoScan ? 'Auto-Scan Active (Snapshots every 10s)' : 'Enable Auto-Scan (Snapshots every 10s)'}
        >
          <Scan size={20} />
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