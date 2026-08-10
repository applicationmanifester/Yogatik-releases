import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench,
  AlertTriangle, Monitor, MonitorOff, MessageSquare, Eye, EyeOff,
  Copy, Check, ChevronRight, Aperture, X, Volume2, Scan,
} from 'lucide-react'
import { runAgent } from '../agent'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'
import { captureProfile, describeWithoutModel } from '../vision/source'
import { buzz } from '../features'

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
  const [state, setState] = useState('connecting')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [camOn, setCamOn] = useState(true)
  const [screenOn, setScreenOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [tool, setTool] = useState(null)
  const [lines, setLines] = useState([])
  const [transcript, setTranscript] = useState([])    // full history
  const [showTranscript, setShowTranscript] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(-1)
  const [frameSent, setFrameSent] = useState(false)
  const [liveVoice, setVoiceEngine] = useState(voiceEngine === 'neural' ? 'loading' : 'system')
  const [activeProvider, setActiveProvider] = useState({ provider, model })
  useEffect(() => {
    setActiveProvider({ provider, model })
  }, [provider, model])

  // Vision Modal State
  const [visionOpen, setVisionOpen] = useState(false)
  const [visionImage, setVisionImage] = useState(null)
  const [visionText, setVisionText] = useState('')
  const [visionLoading, setVisionLoading] = useState(false)
  const [visionQ, setVisionQ] = useState('')
  const [visionVia, setVisionVia] = useState('')
  const [autoScan, setAutoScan] = useState(features.autoScan === true)

  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const turnRef = useRef({ role: null, text: '' })
  const transcriptEndRef = useRef(null)
  const frameTimerRef = useRef(null)

  /** Transcript deltas arrive fragmented; merge into the current speaker's line. */
  const pushDelta = useCallback((role, text) => {
    // Captions (last 6 lines)
    setLines((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === role) {
        const merged = [...prev]
        merged[merged.length - 1] = { role, text: last.text + text }
        return merged.slice(-6)
      }
      return [...prev, { role, text }].slice(-6)
    })
    // Full transcript
    setTranscript((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === role && last.type === 'message') {
        const merged = [...prev]
        merged[merged.length - 1] = { ...last, text: last.text + text, time: Date.now() }
        return merged
      }
      return [...prev, { role, text, type: 'message', time: Date.now() }]
    })
    const t = turnRef.current
    if (t.role === role) t.text += text
    else {
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      turnRef.current = { role, text }
    }
  }, [onTranscript])

  useEffect(() => {
    setState('connecting')
    setError('')
    setTool(null)
    setThinking(false)
    setSpeaking(false)

    let cancelled = false
    const make = engine === 'gemini' ? createLiveSession : createCascadeSession
    const session = make({
      provider, apiKey, model, voice, voiceEngine, fallbacks,
      persona, disabledTools, modelCanSee, camera: true,
      onEvent: (e) => {
        if (cancelled) return
        switch (e.type) {
          case 'ready': setState('live'); break
          case 'camera':
            if (videoRef.current) videoRef.current.srcObject = e.stream
            break
          case 'screen':
            setScreenOn(e.active ?? !!e.stream)
            break
          case 'level': setLevel(e.value); break
          case 'speaking': setSpeaking(e.value); break
          case 'thinking': setThinking(e.value); break
          case 'transcript': pushDelta(e.role, e.text); break
          case 'tools':
            setTool(e.names.join(', '))
            setTranscript(prev => [...prev, { type: 'tool', name: e.names.join(', '), time: Date.now() }])
            break
          case 'toolResult':
            setTool(null)
            setTranscript(prev => [...prev, {
              type: 'toolResult', name: e.name, time: Date.now(),
              result: typeof e.result === 'string' ? e.result : JSON.stringify(e.result, null, 2)?.slice(0, 300),
            }])
            break
          case 'voice': setVoiceEngine(e.engine); break
          case 'provider': setActiveProvider({ provider: e.provider, model: e.model }); break
          case 'reconnecting': setState('connecting'); break
          case 'error': setError(e.message); setState('error'); break
          case 'ended': setState('ended'); break
          default: break
        }
      },
    })
    sessionRef.current = session
    session.start().catch((err) => {
      if (cancelled) return
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone and camera access were blocked. Allow them in your browser, then try again.'
          : err?.message || String(err)
      )
      setState('error')
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
        setFrameSent(true)
        setTimeout(() => setFrameSent(false), 200)
      }, 1000)
    }
    return () => clearInterval(frameTimerRef.current)
  }, [camOn, screenOn])

  // Periodic Auto-Scan vision timer
  useEffect(() => {
    let timer = null
    if (autoScan && (camOn || screenOn) && state === 'live') {
      timer = setInterval(() => {
        // The session grabs its own frame: it owns the stream, applies the
        // capture profile, and skips frames identical to the last one.
        sessionRef.current?.watch?.()
      }, 10000)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [autoScan, camOn, screenOn, state])

  const toggleMute = () => {
    const v = !muted
    setMuted(v)
    sessionRef.current?.setMuted(v)
    // Haptic on mobile
    buzz(features, 30)
  }
  const toggleCam = async () => {
    const v = !camOn
    setCamOn(v)
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
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(-1), 1500)
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
    setVisionImage(b64)
    setVisionText(''); setVisionQ(''); setVisionVia('')
    setVisionOpen(true)
  }

  /**
   * Answer a question about the frame. Same fallback chain as the `see` tool,
   * so the panel works on a model that cannot take images at all.
   */
  const askVision = async (question) => {
    const q = (question || '').trim() ||
      'Describe exactly what you see: the setting, the objects, any people, and any legible text.'
    setVisionLoading(true)
    setVisionText('')
    // Re-capture: a "read this label" question needs a sharper frame than the
    // preview shot that opened the panel.
    const b64 = captureFrame(q) || visionImage
    if (b64) setVisionImage(b64)
    const dataUrl = `data:image/jpeg;base64,${b64}`

    try {
      if (modelCanSee) {
        setVisionVia(model ? model.split('/').pop() : provider)
        await runAgent({
          provider, apiKey, model,
          userMessage: [
            { type: 'text', text: q },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
          toolsEnabled: false,
          onToken: (t) => setVisionText(prev => prev + t),
        })
      } else {
        setVisionVia('on-device')
        const { via, text } = await describeWithoutModel(dataUrl, q)
        setVisionVia(via === 'ocr' ? 'OCR' : 'on-device VLM')
        setVisionText(text)
      }
    } catch (err) {
      setVisionText(prev => prev + `\n\n[Analysis failed: ${err.message}]`)
    } finally {
      setVisionLoading(false)
    }
  }

  /** Hand the question to the call itself, so the answer lands in context. */
  const askInCall = () => {
    const q = visionQ.trim()
    if (!q) return
    sessionRef.current?.sendText(q)
    setVisionOpen(false)
  }

  // Orb scale tracks the model's own output level
  const orbScale = 1 + (speaking ? level * 0.45 : 0)
  const ring2Scale = 1 + (speaking ? level * 0.3 : 0)
  const ring3Scale = 1 + (speaking ? level * 0.18 : 0)

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
              </option>
            ))}
          </select>
        ) : (
          <span className="live-badge provider">
            {activeProvider.provider}
            {activeProvider.model ? ` · ${activeProvider.model.split('/').pop().slice(0, 20)}` : ''}
          </span>
        )}
        {liveVoice !== 'system' && (
          <span className="live-badge awareness" title="On-device neural voice">
            <Volume2 size={12} /> {liveVoice === 'loading' ? 'Voice loading…' : 'Neural voice'}
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
            className={`live-mascot ${speaking ? 'speaking' : ''} ${state === 'connecting' ? 'pending' : ''} ${thinking ? 'thinking' : ''}`}
            style={{ transform: `scale(${orbScale})` }}
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
                  ? `M208 280 q48 ${Math.round(30 + level * 50)} 96 0`
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
        {thinking && (
          <div className="live-status thinking-status">
            <span className="thinking-dots"><span /><span /><span /></span>
            Thinking…
          </div>
        )}
        {tool && <div className="live-status"><Wrench size={14} /> {tool}</div>}

        {/* Dynamic Soundwave / Audio Bar Visualizer */}
        <div className={`live-soundwave ${speaking || level > 0.02 ? 'active' : ''}`}>
          {[0.6, 1.2, 0.9, 1.4, 0.7].map((factor, idx) => (
            <span
              key={idx}
              className="soundwave-bar"
              style={{
                height: `${Math.max(6, Math.min(36, (level || (speaking ? 0.25 : 0)) * 90 * factor))}px`,
                opacity: (speaking || level > 0.02) ? 0.95 : 0.3,
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
          onClick={() => setAutoScan(!autoScan)}
          disabled={!camOn && !screenOn}
          aria-label={autoScan ? 'Disable Auto-Scan' : 'Enable Auto-Scan'}
          title={autoScan ? 'Auto-Scan Active (Snapshots every 10s)' : 'Enable Auto-Scan (Snapshots every 10s)'}
        >
          <Scan size={20} />
        </button>
        <button
          className={`live-btn transcript-toggle ${showTranscript ? 'active-transcript' : ''}`}
          onClick={() => setShowTranscript(!showTranscript)}
          aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* Transcript sidebar */}
      <div className={`live-transcript-panel ${showTranscript ? 'open' : ''}`}>
        <div className="live-transcript-header">
          <h3>Transcript</h3>
          <button className="live-transcript-close" onClick={() => setShowTranscript(false)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="live-transcript-body">
          {transcript.length === 0 && (
            <p className="live-transcript-empty">Conversation will appear here…</p>
          )}
          {transcript.map((item, i) => {
            if (item.type === 'tool') {
              return (
                <div key={i} className="live-transcript-tool">
                  <Wrench size={12} /> <span>{item.name}</span>
                  <time>{formatTime(item.time)}</time>
                </div>
              )
            }
            if (item.type === 'toolResult') {
              return (
                <div key={i} className="live-transcript-tool result">
                  <span>↳ {item.result?.slice(0, 120)}{item.result?.length > 120 ? '…' : ''}</span>
                </div>
              )
            }
            return (
              <div key={i} className={`live-transcript-msg ${item.role}`}>
                <div className="live-transcript-msg-header">
                  <span className="live-transcript-role">{item.role === 'user' ? 'You' : 'Yogatik'}</span>
                  <time>{formatTime(item.time)}</time>
                  <button
                    className="live-transcript-copy"
                    onClick={() => copyText(item.text, i)}
                    aria-label="Copy message"
                  >
                    {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <p>{item.text}</p>
              </div>
            )
          })}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Vision Modal Overlay */}
      {visionOpen && (
        <div className="vision-modal-overlay">
          <div className="vision-modal">
            <div className="vision-modal-header">
              <h3>What am I looking at?</h3>
              {visionVia && <span className="vision-modal-via">via {visionVia}</span>}
              <button className="vision-modal-close" onClick={() => setVisionOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="vision-modal-body">
              {visionImage && (
                <div className="vision-modal-image">
                  <img src={`data:image/jpeg;base64,${visionImage}`} alt="Captured scene" />
                  <button
                    className="vision-modal-retake"
                    onClick={() => { const b = captureFrame(visionQ); if (b) setVisionImage(b) }}
                    disabled={visionLoading}
                  >
                    <Aperture size={14} /> Retake
                  </button>
                </div>
              )}

              <form
                className="vision-modal-ask"
                onSubmit={(e) => { e.preventDefault(); askVision(visionQ) }}
              >
                <input
                  autoFocus
                  value={visionQ}
                  onChange={(e) => setVisionQ(e.target.value)}
                  placeholder="Ask about this frame — or leave blank to describe it"
                  aria-label="Question about the current frame"
                />
                <button type="submit" className="btn" disabled={visionLoading} aria-label="Ask about this frame">
                  {visionLoading ? <Loader2 size={14} className="spin" /> : 'Ask'}
                </button>
              </form>

              <div className="vision-modal-chips">
                {[
                  { label: '🔍 Summarize Scene', q: 'Describe exactly what you see: setting, objects, people, and main details.' },
                  { label: '📝 Extract Text (OCR)', q: 'Read all legible text visible in this frame word for word.' },
                  { label: '💻 Explain Code', q: 'Analyze and explain any code or technical content visible on screen.' },
                  { label: '🎯 Identify Objects', q: 'List all major objects visible in this image with high accuracy.' },
                  { label: '⚡ Spot Issues', q: 'Identify any obvious errors, issues, or unusual elements in this image.' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    className="vision-chip"
                    disabled={visionLoading}
                    onClick={() => { setVisionQ(chip.q); askVision(chip.q) }}
                  >{chip.label}</button>
                ))}
              </div>

              <div className="vision-modal-text">
                {visionLoading && !visionText && (
                  <div className="vision-modal-loading">
                    <Loader2 size={16} className="spin" /> Looking…
                  </div>
                )}
                {visionText && <p>{visionText}</p>}
                {visionLoading && visionText && <span className="vision-modal-cursor" />}
              </div>

              {visionText && !visionLoading && (
                <div className="vision-modal-actions">
                  <button className="btn ghost" onClick={() => copyText(visionText, -2)}>
                    {copiedIdx === -2 ? <Check size={14} /> : <Copy size={14} />} Copy
                  </button>
                  <button className="btn ghost" onClick={askInCall} disabled={!visionQ.trim()}>
                    <MessageSquare size={14} /> Ask out loud
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
