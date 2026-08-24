import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, X, Eye, EyeOff, Zap, ShieldCheck, Square, GripHorizontal, Pin, PinOff,
  Mic, MicOff, Volume2, VolumeX, Camera, ChevronDown, ChevronUp, Sparkles, Terminal
} from 'lucide-react'
import { streamMessage, getVisionStatus } from '../api'
import { subscribeActivity } from '../activityStream'
import { createWatchState, shouldLook, noteLook, setPaused } from '../companion/watch'
import { hashDataUrl } from '../companion/screenHash'
import { createActionGate, MODES } from '../companion/gate'
import { describeWithoutModel } from '../vision/source'
import { useCompanionVoice } from '../companion/useCompanionVoice'

/** Parse and sanitize companion reply, separating <think> reasoning and filtering out silent sentinels */
function sanitizeReply(raw) {
  const str = String(raw || '').trim()
  if (!str) return { isSilent: true, text: '', thoughts: '' }
  
  const thoughtsMatch = str.match(/<think>([\s\S]*?)<\/think>/i)
  const thoughts = thoughtsMatch ? thoughtsMatch[1].trim() : ''
  const cleanText = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  
  const isSilent = !cleanText || /^[\s"'`*_.]*(nothing|nothing-to-add|nothing to add|no-action|none)[\s"'`*_.!]*$/i.test(cleanText)
  return { isSilent, text: isSilent ? '' : cleanText, thoughts }
}

/**
 * High-IQ Autonomous Companion View
 * Capable of multimodal screen watching, webcam vision, voice in/out,
 * and autonomous tool execution (terminal, filesystem, patch, search) in Autopilot.
 */
export function CompanionView() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [rawReply, setRawReply] = useState('')
  const [showThoughts, setShowThoughts] = useState(false)
  const [steps, setSteps] = useState([])
  const [mode, setMode] = useState('auto') // Default to high-IQ Autopilot
  const [watching, setWatching] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [watchNote, setWatchNote] = useState('')
  const [pending, setPending] = useState(null)
  const [pinned, setPinned] = useState(true)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [lastCapturedImage, setLastCapturedImage] = useState(null)
  
  const abortRef = useRef(null)
  const watchRef = useRef(createWatchState())
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const bodyRef = useRef(null)
  const shellRef = useRef(null)
  const contentRef = useRef(null)
  const barRef = useRef(null)
  const inputBarRef = useRef(null)
  const inputRef = useRef(null)
  const canSeeRef = useRef(null)
  const promptHistoryRef = useRef([])
  const historyIndexRef = useRef(-1)
  const draftInputRef = useRef('')

  const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_COMPANION_WIN__) || null
  const isFloatingWindow = !!bridge()
  const canSeeScreen = typeof window !== 'undefined' && !!window.__YOGATIK_COMPANION__?.captureScreen

  // Voice integration (Echo guarded)
  const {
    listening,
    speaking,
    startListening,
    stopListening,
    speak,
  } = useCompanionVoice({
    enabled: true,
    onUtterance: (transcript) => {
      if (transcript && transcript.trim()) {
        setInput(transcript.trim())
        handleSend(transcript.trim())
      }
    },
  })

  // Action gate confirmation hook
  const askUser = useCallback(({ reason, risk, step }) => new Promise((resolve) => {
    setPending({ reason, risk, step, resolve })
  }), [])

  const gateRef = useRef(null)
  if (!gateRef.current) {
    gateRef.current = createActionGate({ mode: MODES.AUTO, confirm: askUser })
  }

  useEffect(() => {
    gateRef.current.setMode(mode === 'auto' ? MODES.AUTO : MODES.ASK)
  }, [mode])

  // Mirror tool steps from main activity stream
  useEffect(() => subscribeActivity((snap) => {
    setSteps(snap.steps.slice(-6))
    if (snap.answer) setRawReply(snap.answer)
  }), [])

  // Probe vision or fallback to OCR
  const prepareVisualContext = useCallback(async (dataUrl, query = '') => {
    if (!dataUrl) return { image: null, promptAddon: '' }

    if (canSeeRef.current === null) {
      try {
        const status = await getVisionStatus()
        canSeeRef.current = !!(status?.cached ?? status?.guessed)
      } catch {
        canSeeRef.current = false
      }
    }

    if (canSeeRef.current) {
      return { image: dataUrl, promptAddon: '' }
    }

    // Text-only model fallback: perform on-device OCR so the model can still understand the screen
    try {
      const described = await describeWithoutModel(dataUrl, query || 'Read text and code on screen')
      const note = described?.text ? `\n[Screen Content OCR:\n${described.text}\n]` : ''
      return { image: null, promptAddon: note }
    } catch {
      return { image: null, promptAddon: '\n[Screen frame captured.]' }
    }
  }, [])

  const handleSend = useCallback(async (textOverride = null, imageOverride = null, opts = {}) => {
    const msg = String(textOverride ?? input).trim()
    if (!msg || busy) return
    if (!opts?.ambient) {
      promptHistoryRef.current = [...promptHistoryRef.current.filter(p => p !== msg), msg]
    }
    historyIndexRef.current = -1
    draftInputRef.current = ''
    setInput('')
    setBusy(true)
    setRawReply('')

    const ctrl = new AbortController()
    abortRef.current = ctrl

    let targetImage = imageOverride || lastCapturedImage
    let promptPayload = msg

    if (targetImage) {
      const { image, promptAddon } = await prepareVisualContext(targetImage, msg)
      targetImage = image
      if (promptAddon) promptPayload = `${msg}\n${promptAddon}`
    }

    let acc = ''
    try {
      await streamMessage(
        {
          message: promptPayload,
          image: targetImage,
          signal: ctrl.signal,
          autonomous: mode === 'auto',
          tools: mode === 'auto',
          use_tools: mode === 'auto',
          ...opts,
        },
        (token) => {
          acc += token
          setRawReply(acc)
        },
        undefined,
        () => {
          setBusy(false)
          const { isSilent, text } = sanitizeReply(acc)
          if (!isSilent && text && speechEnabled) {
            speak(text)
          }
        },
        (e) => {
          setRawReply(`Could not finish: ${e?.message || e}`)
          setBusy(false)
        },
      )
    } catch (e) {
      setRawReply(`Could not finish: ${e?.message || e}`)
      setBusy(false)
    }
  }, [input, busy, lastCapturedImage, mode, prepareVisualContext, speechEnabled, speak])

  const stop = useCallback(() => {
    try { abortRef.current?.abort() } catch {}
    setPending((p) => { try { p?.resolve(false) } catch {} return null })
    setBusy(false)
  }, [])

  // Expose action gate to window for agent tooling
  useEffect(() => {
    window.__YOGATIK_ACTION_GATE__ = gateRef.current
    return () => { delete window.__YOGATIK_ACTION_GATE__ }
  }, [])

  // Webcam stream management
  const toggleCamera = useCallback(async () => {
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      setCameraActive(false)
      setWatchNote('')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraActive(true)
      setWatchNote('Camera active. Watching environment…')
    } catch (e) {
      setWatchNote(`Camera access failed: ${e?.message || e}`)
      setCameraActive(false)
    }
  }, [cameraActive])

  // Screen watching loop
  useEffect(() => {
    if (!watching) { setPaused(watchRef.current, true); return }
    setPaused(watchRef.current, false)
    let alive = true

    const tick = async () => {
      if (!alive || busy) return
      const cam = window.__YOGATIK_COMPANION__
      if (!cam?.captureScreen) {
        setWatchNote('Screen capture is desktop-only.')
        return
      }

      const early = shouldLook(watchRef.current, { now: Date.now(), hash: watchRef.current.lastHash })
      if (!early.look && early.reason !== 'Screen has not changed.') {
        setWatchNote(early.reason)
        return
      }

      let hash = null
      let shot = null
      try {
        shot = await cam.captureScreen()
        if (!alive) return
        if (!shot?.success || !shot?.dataUrl) {
          setWatchNote(shot?.error || 'Could not capture the screen.')
          return
        }
        setLastCapturedImage(shot.dataUrl)
        hash = await hashDataUrl(shot.dataUrl)
      } catch (e) {
        setWatchNote(`Screen capture error: ${e?.message || e}`)
        return
      }
      if (!alive || busy) return

      const decision = shouldLook(watchRef.current, { now: Date.now(), hash })
      setWatchNote(decision.reason)
      if (!decision.look) return

      noteLook(watchRef.current, { now: Date.now(), hash })

      // Dispatch observation with image attached
      handleSend(
        'Look at my screen. If there is an active problem, bug, error, or next step you can help with right now, explain in one concise sentence and take action. If everything looks good and nothing needs action, reply exactly: NOTHING-TO-ADD.',
        shot.dataUrl,
        { ambient: true }
      )
    }

    const id = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [watching, busy, handleSend])

  // Auto-resize floating window based on content
  useEffect(() => {
    const content = contentRef.current
    const b = bridge()
    if (!content || !b?.resize || typeof ResizeObserver !== 'function') return
    let last = 0
    let frame = 0
    const fit = () => {
      frame = 0
      const chrome = (barRef.current?.offsetHeight || 0) + (inputBarRef.current?.offsetHeight || 0)
      const height = Math.ceil(Math.min(chrome + content.scrollHeight + 4, 640))
      if (!height || Math.abs(height - last) < 8) return
      last = height
      b.resize({ height })
    }
    const ro = new ResizeObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(fit)
    })
    ro.observe(content)
    fit()
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => { bridge()?.setAlwaysOnTop?.(pinned) }, [pinned])

  // Global Ctrl+Alt+C selection capture
  useEffect(() => {
    const off = bridge()?.onSelection?.(({ text } = {}) => {
      const t = String(text || '').trim()
      if (!t) return
      setInput(t)
      try { inputRef.current?.focus() } catch {}
    })
    return off
  }, [])

  const { isSilent, text: visibleReply, thoughts } = sanitizeReply(rawReply)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleReply, steps, thoughts])

  return (
    <div className="companion" ref={shellRef}>
      {/* Companion Window Titlebar & HUD Controls */}
      <div className="companion-bar" ref={barRef}>
        <GripHorizontal size={13} className="companion-grip" />
        <span className="companion-title">Yogatik</span>

        {/* Autopilot / Ask First Mode Chip */}
        <button
          className={`companion-chip ${mode === 'auto' ? 'on' : ''}`}
          onClick={() => setMode(mode === 'auto' ? 'ask' : 'auto')}
          title={mode === 'auto'
            ? 'Autopilot: Executes tools and terminal commands autonomously'
            : 'Ask first: Confirms before executing tools'}
        >
          {mode === 'auto' ? <Zap size={12} /> : <ShieldCheck size={12} />}
          {mode === 'auto' ? 'Autopilot' : 'Ask first'}
        </button>

        {/* Screen Watch Toggle */}
        <button
          className={`companion-icon ${watching ? 'on' : ''}`}
          onClick={() => setWatching((w) => !w)}
          disabled={!canSeeScreen}
          title={!canSeeScreen
            ? 'Watching your screen requires the desktop app'
            : watching ? 'Stop watching screen' : 'Watch screen continuously'}
          aria-label="Toggle screen watching"
        >
          {watching ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        {/* Webcam / Camera Toggle */}
        <button
          className={`companion-icon ${cameraActive ? 'on' : ''}`}
          onClick={toggleCamera}
          title={cameraActive ? 'Turn off camera' : 'Turn on camera / visual analysis'}
          aria-label="Toggle camera"
        >
          <Camera size={14} />
        </button>

        {/* Text-to-Speech Output Narration */}
        <button
          className={`companion-icon ${speechEnabled ? 'on' : ''}`}
          onClick={() => setSpeechEnabled((s) => !s)}
          title={speechEnabled ? 'Mute speech output' : 'Enable spoken voice output'}
          aria-label="Toggle voice output"
        >
          {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {/* Pin Always On Top */}
        {isFloatingWindow && (
          <button
            className={`companion-icon ${pinned ? 'on' : ''}`}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Pinned above all windows' : 'Stay on top'}
            aria-label="Toggle pin"
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        )}

        {/* Close / Hide Window */}
        {isFloatingWindow && (
          <button className="companion-icon" onClick={() => bridge()?.hide()} title="Hide companion (Ctrl+Shift+Space)" aria-label="Hide companion">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Hidden video element for webcam frame stream */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />

      {/* Companion Body / Conversation & Action Stream */}
      <div className="companion-body" ref={bodyRef}>
        <div ref={contentRef}>
          {watching && <div className="companion-note">👁️ {watchNote || 'Watching screen…'}</div>}
          {cameraActive && <div className="companion-note">📷 Camera active and monitoring…</div>}

          {/* Active Execution Steps HUD */}
          {steps.length > 0 && (
            <div className="companion-steps">
              {steps.map((s) => (
                <div key={s.id} className={`companion-step ${s.status || ''}`}>
                  <Terminal size={11} style={{ marginRight: 4 }} />
                  <span>{s.name}</span>
                  {s.ms != null && <span className="companion-ms">{(s.ms / 1000).toFixed(1)}s</span>}
                </div>
              ))}
            </div>
          )}

          {/* Action Approval Confirmation Card */}
          {pending && (
            <div className="companion-confirm">
              <div className="companion-confirm-why">
                <strong>{pending.risk === 'confirm' ? 'Permission Required' : 'Action Confirmation'}</strong>
                <div>{pending.reason}</div>
              </div>
              <div className="companion-confirm-actions">
                <button onClick={() => { pending.resolve(true); setPending(null) }}>Allow Action</button>
                <button className="ghost" onClick={() => { pending.resolve(false); setPending(null) }}>Skip</button>
              </div>
            </div>
          )}

          {/* Reasoning / Thinking Expander */}
          {thoughts && (
            <div className="companion-thoughts-block" style={{ marginBottom: 6 }}>
              <button
                className="companion-thoughts-toggle"
                onClick={() => setShowThoughts((st) => !st)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Sparkles size={10} />
                <span>Thinking Process</span>
                {showThoughts ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showThoughts && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                    padding: '4px 6px',
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap',
                    borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                    marginTop: 4
                  }}
                >
                  {thoughts}
                </div>
              )}
            </div>
          )}

          {/* Main Content Reply */}
          {!isSilent && visibleReply ? (
            <div className="companion-reply">{visibleReply}</div>
          ) : (
            !busy && <div className="companion-idle">Ask me anything, or let me watch your screen & camera.</div>
          )}
          {busy && !visibleReply && <div className="companion-idle">Thinking & acting…</div>}
        </div>
      </div>

      {/* Input Bar with Voice Mic & Send */}
      <div className="companion-input" ref={inputBarRef}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              const isAtStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0
              const isEmpty = !input
              if (isEmpty || isAtStart) {
                const historyList = promptHistoryRef.current
                if (historyList.length > 0) {
                  if (historyIndexRef.current === -1) {
                    draftInputRef.current = input
                    historyIndexRef.current = historyList.length - 1
                  } else if (historyIndexRef.current > 0) {
                    historyIndexRef.current -= 1
                  }
                  const targetPrompt = historyList[historyIndexRef.current]
                  if (targetPrompt !== undefined) {
                    e.preventDefault()
                    setInput(targetPrompt)
                    setTimeout(() => {
                      try {
                        inputRef.current?.setSelectionRange(targetPrompt.length, targetPrompt.length)
                      } catch {}
                    }, 0)
                    return
                  }
                }
              }
            }
            if (e.key === 'ArrowDown') {
              if (historyIndexRef.current !== -1) {
                const historyList = promptHistoryRef.current
                if (historyIndexRef.current < historyList.length - 1) {
                  historyIndexRef.current += 1
                  const targetPrompt = historyList[historyIndexRef.current]
                  e.preventDefault()
                  setInput(targetPrompt)
                  setTimeout(() => {
                    try {
                      inputRef.current?.setSelectionRange(targetPrompt.length, targetPrompt.length)
                    } catch {}
                  }, 0)
                  return
                } else {
                  historyIndexRef.current = -1
                  const restored = draftInputRef.current || ''
                  e.preventDefault()
                  setInput(restored)
                  setTimeout(() => {
                    try {
                      inputRef.current?.setSelectionRange(restored.length, restored.length)
                    } catch {}
                  }, 0)
                  return
                }
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={mode === 'auto' ? 'Give me a goal or question…' : 'Ask me something…'}
          aria-label="Message"
        />

        {/* Microphone Voice In */}
        <button
          type="button"
          className={`companion-icon-btn ${listening ? 'listening' : ''}`}
          onClick={listening ? stopListening : startListening}
          title={listening ? 'Stop listening' : 'Speak to companion'}
          aria-label="Voice input"
        >
          {listening ? <MicOff size={14} color="#f87171" /> : <Mic size={14} />}
        </button>

        {busy ? (
          <button onClick={stop} title="Stop" aria-label="Stop"><Square size={14} /></button>
        ) : (
          <button onClick={() => handleSend()} disabled={!input.trim()} title="Send" aria-label="Send">
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default CompanionView
export { createActionGate }
