import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send, X, Eye, EyeOff, Zap, ShieldCheck, Square, GripHorizontal, Pin, PinOff,
  Mic, MicOff, Volume2, VolumeX, Camera, ChevronDown, ChevronUp, Sparkles, Terminal,
  ScanEye, Trash2, Copy, Check, Radio, Bug, FileCode, CheckCircle2,
} from 'lucide-react'
import { useCompanionBrain } from '../companion/useCompanionBrain'
import { useCompanionVoice } from '../companion/useCompanionVoice'
import { createActionGate, MODES } from '../companion/gate'
import { describeEntry, summarize } from '../companion/trail'
import { isSilence, PERSONAS } from '../companion/companionChat'

/**
 * The floating companion window (?companion=1) — and now the SAME companion
 * that runs in the in-app panel.
 */

/** Split a reply into its <think> block and the part meant to be read. */
export function splitThinking(raw) {
  const str = String(raw || '')
  const m = str.match(/<think>([\s\S]*?)<\/think>/i)
  return {
    thoughts: m ? m[1].trim() : '',
    text: str.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim(),
  }
}

/** Audio Wave Indicator */
function MiniEqualizer({ active = false }) {
  return (
    <div className="companion-audio-wave" title="Audio Activity">
      {[0.4, 0.9, 0.6, 1.0, 0.5].map((h, i) => (
        <span
          key={i}
          style={{
            height: active ? `${Math.max(4, h * 12)}px` : '3px',
            animation: active ? `companion-eq 0.7s ease-in-out ${i * 0.12}s infinite alternate` : 'none',
          }}
        />
      ))}
    </div>
  )
}

/** Render formatted message with 1-click copy code snippets */
function CompanionTurnContent({ text }) {
  const [copiedIdx, setCopiedIdx] = useState(null)
  if (!text) return null

  const parts = []
  const codeRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match
  let blockIdx = 0

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const idx = blockIdx++
    parts.push({ type: 'code', lang: match[1] || 'code', code: match[2], idx })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  const copyCode = (code, idx) => {
    try {
      navigator.clipboard.writeText(code)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1800)
    } catch {}
  }

  return (
    <div className="companion-turn-inner">
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return <span key={i} className="companion-text-segment">{p.text}</span>
        }
        return (
          <div key={i} className="companion-code-box">
            <div className="companion-code-header">
              <span className="companion-code-lang">{p.lang}</span>
              <button
                type="button"
                className="companion-copy-btn"
                onClick={() => copyCode(p.code, p.idx)}
                title="Copy code"
              >
                {copiedIdx === p.idx ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                <span>{copiedIdx === p.idx ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="companion-code-pre"><code>{p.code}</code></pre>
          </div>
        )
      })}
    </div>
  )
}

/** Turns kept on screen. This is a glanceable strip, not a chat window. */
const VISIBLE_TURNS = 6

export function CompanionView() {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('ask')
  const [showThoughts, setShowThoughts] = useState(false)
  const [showTrail, setShowTrail] = useState(false)
  const [showPersonaMenu, setShowPersonaMenu] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [pending, setPending] = useState(null)
  const [note, setNote] = useState('')

  const shellRef = useRef(null)
  const barRef = useRef(null)
  const bodyRef = useRef(null)
  const contentRef = useRef(null)
  const inputBarRef = useRef(null)
  const inputRef = useRef(null)
  const promptHistoryRef = useRef([])
  const historyIndexRef = useRef(-1)
  const draftInputRef = useRef('')

  const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_COMPANION_WIN__) || null
  const isFloatingWindow = !!bridge()

  /* ── the shared brain ─────────────────────────────────────────────────── */
  const brainRef = useRef(null)
  const voice = useCompanionVoice({
    onUtterance: (text) => {
      const t = String(text || '').trim()
      if (t) brainRef.current?.ask(t, null, { tools: true })
    },
  })
  const brain = useCompanionBrain({
    surface: 'window',
    mode,
    onSpeakText: (text) => { if (voice.speechEnabled) voice.speak(text) },
  })
  brainRef.current = brain

  /* ── action gate ──────────────────────────────────────────────────────── */
  const askUser = useCallback(({ reason, risk, step }) => new Promise((resolve) => {
    setPending({ reason, risk, step, resolve })
  }), [])

  const gateRef = useRef(null)
  if (!gateRef.current) gateRef.current = createActionGate({ mode: MODES.ASK, confirm: askUser })
  useEffect(() => { gateRef.current.setMode(mode === 'auto' ? MODES.AUTO : MODES.ASK) }, [mode])

  useEffect(() => {
    window.__YOGATIK_ACTION_GATE__ = gateRef.current
    return () => { delete window.__YOGATIK_ACTION_GATE__ }
  }, [])

  useEffect(() => () => { try { pending?.resolve(false) } catch {} }, [pending])

  /* ── window chrome & sizing ───────────────────────────────────────────── */
  useEffect(() => {
    if (!isFloatingWindow || typeof ResizeObserver === 'undefined') return undefined
    let frame = null
    const fit = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const h = (barRef.current?.offsetHeight || 0)
          + (contentRef.current?.offsetHeight || 0)
          + (inputBarRef.current?.offsetHeight || 0)
        bridge()?.setHeight?.(Math.round(h + 16))
      })
    }
    const ro = new ResizeObserver(fit)
    if (contentRef.current) ro.observe(contentRef.current)
    fit()
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [isFloatingWindow])

  useEffect(() => { bridge()?.setAlwaysOnTop?.(pinned) }, [pinned])

  useEffect(() => {
    const off = bridge()?.onSelection?.(({ text } = {}) => {
      const t = String(text || '').trim()
      if (!t) return
      setInput(t)
      try { inputRef.current?.focus() } catch {}
    })
    return off
  }, [])

  /* ── keyboard shortcuts (PTT & hotkeys) ───────────────────────────────── */
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ctrl+Alt+W: Toggle Watch
      if (e.ctrlKey && e.altKey && e.code === 'KeyW') {
        e.preventDefault()
        toggleWatch()
        return
      }
      // Ctrl+Alt+M: Toggle Voice
      if (e.ctrlKey && e.altKey && e.code === 'KeyM') {
        e.preventDefault()
        voice.toggleListening()
        return
      }
      // Ctrl+Alt+V: Push-To-Talk
      if (e.ctrlKey && e.altKey && e.code === 'KeyV' && !voice.pttActive) {
        e.preventDefault()
        voice.startPtt()
      }
    }

    const onKeyUp = (e) => {
      if (e.code === 'KeyV' && voice.pttActive) {
        e.preventDefault()
        voice.stopPtt()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [voice, brain])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [brain.messages, brain.streamText, brain.steps, showTrail])

  /* ── sending & actions ────────────────────────────────────────────────── */
  const send = useCallback(async (textOverride = null) => {
    const msg = String(textOverride ?? input).trim()
    if (!msg || brain.busy) return
    promptHistoryRef.current = [...promptHistoryRef.current.filter(p => p !== msg), msg]
    historyIndexRef.current = -1
    draftInputRef.current = ''
    setInput('')
    await brain.ask(msg, null, { tools: true })
  }, [input, brain])

  const toggleWatch = useCallback(async () => {
    if (brain.watching) { brain.stopWatch(); return }
    const ok = await brain.startWatch()
    if (!ok) setNote(brain.error || 'Could not start watching.')
  }, [brain])

  const toggleCamera = useCallback(async () => {
    if (brain.cameraOn) { brain.stopCamera(); return }
    const ok = await brain.startCamera()
    if (!ok) setNote(brain.error || 'Could not start the camera.')
  }, [brain])

  const onInputKey = useCallback((e) => {
    const historyList = promptHistoryRef.current
    if (e.key === 'ArrowUp' && (!input || (e.target.selectionStart === 0 && e.target.selectionEnd === 0))) {
      if (!historyList.length) return
      if (historyIndexRef.current === -1) {
        draftInputRef.current = input
        historyIndexRef.current = historyList.length - 1
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1
      }
      const target = historyList[historyIndexRef.current]
      if (target === undefined) return
      e.preventDefault()
      setInput(target)
      return
    }
    if (e.key === 'ArrowDown' && historyIndexRef.current !== -1) {
      e.preventDefault()
      if (historyIndexRef.current < historyList.length - 1) {
        historyIndexRef.current += 1
        setInput(historyList[historyIndexRef.current])
      } else {
        historyIndexRef.current = -1
        setInput(draftInputRef.current || '')
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }, [input, send])

  /* ── derived view ─────────────────────────────────────────────────────── */
  const turns = useMemo(
    () => brain.messages.filter(m => !(m.role === 'assistant' && isSilence(m.content))).slice(-VISIBLE_TURNS),
    [brain.messages],
  )
  const live = useMemo(() => splitThinking(brain.streamText), [brain.streamText])
  const trailSummary = useMemo(() => summarize(brain.trail), [brain.trail])
  const canWatch = !!brain.capabilities.screen
  const currentPersona = PERSONAS[brain.persona] || PERSONAS.pair
  const isAudioActive = voice.listening || voice.pttActive || voice.speaking

  return (
    <div className="companion" ref={shellRef}>
      <div className="companion-bar" ref={barRef}>
        <GripHorizontal size={13} className="companion-grip" />
        <span className="companion-title">Yogatik</span>

        {/* Persona Switcher */}
        <div className="companion-persona-wrap">
          <button
            className="companion-chip"
            onClick={() => setShowPersonaMenu(s => !s)}
            title={`Active Persona: ${currentPersona.name} (${currentPersona.tagline})`}
          >
            {brain.persona === 'security' && <ShieldCheck size={12} color="#38bdf8" />}
            {brain.persona === 'copilot' && <Zap size={12} color="#f59e0b" />}
            {brain.persona === 'concierge' && <Sparkles size={12} color="#a855f7" />}
            {brain.persona === 'pair' && <Terminal size={12} color="#10b981" />}
            <span>{currentPersona.name.split(' ')[0]}</span>
            <ChevronDown size={10} />
          </button>

          {showPersonaMenu && (
            <div className="companion-persona-popover">
              <div className="companion-popover-title">Select Companion Persona</div>
              {Object.values(PERSONAS).map(p => (
                <button
                  key={p.id}
                  className={`companion-persona-item ${brain.persona === p.id ? 'active' : ''}`}
                  onClick={() => { brain.setPersona(p.id); setShowPersonaMenu(false) }}
                >
                  <div className="companion-persona-header">
                    <strong>{p.name}</strong>
                    {brain.persona === p.id && <CheckCircle2 size={12} color="var(--accent)" />}
                  </div>
                  <div className="companion-persona-tagline">{p.tagline}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Autopilot / Ask First Toggle */}
        <button
          className={`companion-chip ${mode === 'auto' ? 'on' : ''}`}
          onClick={() => setMode(mode === 'auto' ? 'ask' : 'auto')}
          title={mode === 'auto'
            ? 'Autopilot: acts on its own, and still stops to confirm anything irreversible'
            : 'Ask first: confirms every action before it runs'}
        >
          {mode === 'auto' ? <Zap size={12} /> : <ShieldCheck size={12} />}
          {mode === 'auto' ? 'Autopilot' : 'Ask first'}
        </button>

        <button
          className={`companion-icon ${brain.watching ? 'on' : ''}`}
          onClick={toggleWatch}
          disabled={!canWatch}
          title={!canWatch
            ? 'No screen capture is available in this browser'
            : brain.watching
              ? 'Stop watching (Ctrl+Alt+W)'
              : brain.capabilities.screen === 'native'
                ? 'Watch this screen (Ctrl+Alt+W)'
                : 'Share a window or tab for the companion to watch'}
          aria-label="Toggle screen watching"
          aria-pressed={brain.watching}
        >
          {brain.watching ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        <button
          className={`companion-icon ${brain.cameraOn ? 'on' : ''}`}
          onClick={toggleCamera}
          disabled={!brain.capabilities.camera}
          title={brain.cameraOn ? 'Turn off the camera' : 'Turn on the camera'}
          aria-label="Toggle camera"
          aria-pressed={brain.cameraOn}
        >
          <Camera size={14} />
        </button>

        <button
          className={`companion-icon ${voice.speechEnabled ? 'on' : ''}`}
          onClick={() => voice.setSpeechEnabled(!voice.speechEnabled)}
          title={voice.speechEnabled ? 'Mute spoken replies' : 'Speak replies aloud'}
          aria-label="Toggle voice output"
          aria-pressed={voice.speechEnabled}
        >
          {voice.speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {isFloatingWindow && (
          <button
            className={`companion-icon ${pinned ? 'on' : ''}`}
            onClick={() => setPinned(p => !p)}
            title={pinned ? 'Pinned above all windows' : 'Stay on top'}
            aria-label="Toggle pin"
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        )}

        {isFloatingWindow && (
          <button className="companion-icon" onClick={() => bridge()?.hide()} title="Hide (Ctrl+Shift+Space)" aria-label="Hide companion">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="companion-body" ref={bodyRef}>
        <div ref={contentRef}>
          {(brain.watching || brain.cameraOn) && (
            <button
              className="companion-note as-button"
              onClick={() => setShowTrail(v => !v)}
              title="What the companion has noticed"
            >
              <ScanEye size={11} />
              <span>{brain.summary}</span>
              <em>{trailSummary.headline}</em>
              {showTrail ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}

          {/* Quick Action Chips Bar */}
          <div className="companion-quick-actions">
            <button
              type="button"
              className="companion-action-chip"
              onClick={() => brain.quickActions.reviewGitDiff()}
              disabled={brain.busy}
              title="Review unstaged & staged workspace changes"
            >
              <FileCode size={11} />
              <span>Review Git</span>
            </button>
            <button
              type="button"
              className="companion-action-chip"
              onClick={() => brain.quickActions.scanTerminalErrors()}
              disabled={brain.busy}
              title="Diagnose recent terminal & app errors"
            >
              <Bug size={11} />
              <span>Scan Errors</span>
            </button>
            <button
              type="button"
              className="companion-action-chip"
              onClick={() => brain.quickActions.suggestTests()}
              disabled={brain.busy}
              title="Suggest targeted unit tests"
            >
              <CheckCircle2 size={11} />
              <span>Suggest Tests</span>
            </button>
          </div>

          {/* Observation receipts */}
          {showTrail && (
            <div className="companion-trail">
              {brain.trail.length === 0 && <div className="companion-trail-row muted">Nothing noticed yet.</div>}
              {brain.trail.slice().reverse().map(e => (
                <div key={e.id} className={`companion-trail-row ${e.kind}`}>
                  <span className="t">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{describeEntry(e)}</span>
                </div>
              ))}
              {brain.trail.length > 0 && (
                <button className="companion-trail-clear" onClick={brain.clearTrail}>
                  <Trash2 size={10} /> Clear
                </button>
              )}
            </div>
          )}

          {/* Active Tool Steps */}
          {brain.steps.length > 0 && (
            <div className="companion-steps">
              {brain.steps.slice(-6).map(s => (
                <div key={s.id} className={`companion-step ${s.status || ''}`}>
                  <Terminal size={11} style={{ marginRight: 4 }} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          )}

          {pending && (
            <div className="companion-confirm">
              <div className="companion-confirm-why">
                <strong>{pending.risk === 'confirm' ? 'Confirm this action' : 'Allow this action?'}</strong>
                <div>{pending.reason}</div>
              </div>
              <div className="companion-confirm-actions">
                <button onClick={() => { pending.resolve(true); setPending(null) }}>Allow</button>
                <button className="ghost" onClick={() => { pending.resolve(false); setPending(null) }}>Skip</button>
              </div>
            </div>
          )}

          {/* Chat Turns */}
          {turns.map((m, i) => {
            const { text } = m.role === 'assistant' ? splitThinking(m.content) : { text: m.content }
            if (!text) return null
            return (
              <div key={`${i}:${m.role}`} className={`companion-turn ${m.role}`}>
                <CompanionTurnContent text={text} />
              </div>
            )
          })}

          {live.thoughts && (
            <div className="companion-thoughts-block">
              <button className="companion-thoughts-toggle" onClick={() => setShowThoughts(s => !s)}>
                <Sparkles size={10} />
                <span>Thinking</span>
                {showThoughts ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showThoughts && <div className="companion-thoughts">{live.thoughts}</div>}
            </div>
          )}

          {live.text && (
            <div className="companion-reply">
              <CompanionTurnContent text={live.text} />
            </div>
          )}

          {brain.busy && !live.text && <div className="companion-idle">Thinking…</div>}
          {!brain.busy && !turns.length && !live.text && (
            <div className="companion-idle">
              Ask me anything{canWatch ? ', or let me watch your screen' : ''}.
            </div>
          )}
          {(note || brain.error) && <div className="companion-error">{note || brain.error}</div>}
        </div>
      </div>

      <div className="companion-input" ref={inputBarRef}>
        {/* Equalizer Visualizer */}
        {isAudioActive && <MiniEqualizer active={true} />}

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); brain.setTyping(!!e.target.value) }}
          onBlur={() => brain.setTyping(false)}
          onKeyDown={onInputKey}
          placeholder={mode === 'auto' ? 'Give me a goal…' : 'Ask me something…'}
          aria-label="Message"
        />

        {/* Push-to-Talk Button (Hold or Click) */}
        <button
          type="button"
          className={`companion-icon-btn ${voice.pttActive ? 'listening' : ''}`}
          onMouseDown={voice.startPtt}
          onMouseUp={voice.stopPtt}
          onTouchStart={voice.startPtt}
          onTouchEnd={voice.stopPtt}
          disabled={!voice.available}
          title={!voice.available ? 'Speech recognition unavailable' : 'Hold to Speak (Ctrl+Alt+V)'}
          aria-label="Push to Talk"
        >
          <Radio size={13} color={voice.pttActive ? '#10b981' : undefined} />
        </button>

        {/* Continuous Voice Toggle */}
        <button
          type="button"
          className={`companion-icon-btn ${voice.listening && !voice.pttActive ? 'listening' : ''}`}
          onClick={voice.toggleListening}
          disabled={!voice.available}
          title={!voice.available ? 'Speech recognition is unavailable here' : voice.listening ? 'Stop listening (Ctrl+Alt+M)' : 'Continuous Voice (Ctrl+Alt+M)'}
          aria-label="Voice input"
          aria-pressed={voice.listening}
        >
          {voice.listening ? <MicOff size={14} color="#f87171" /> : <Mic size={14} />}
        </button>

        {brain.busy ? (
          <button onClick={brain.stop} title="Stop" aria-label="Stop"><Square size={14} /></button>
        ) : (
          <button onClick={() => send()} disabled={!input.trim()} title="Send" aria-label="Send">
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default CompanionView
export { createActionGate }

