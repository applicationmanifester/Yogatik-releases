import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Eye, EyeOff, Zap, ShieldCheck, Square, GripHorizontal } from 'lucide-react'
import { streamMessage } from '../api'
import { subscribeActivity } from '../activityStream'
import { createWatchState, shouldLook, noteLook, setPaused } from '../companion/watch'
import { classifyAction } from '../companion/policy'

/**
 * The floating companion: a small always-on-top assistant that stays with the
 * user while they work in other applications.
 *
 * It runs the SAME agent as the main window (same origin, same IndexedDB, same
 * tools) — this is a compact surface onto it, not a second implementation.
 *
 * Two modes:
 *   ask   — proposes, waits for a click. The default.
 *   auto  — pursues a goal on its own, still stopping on anything the policy
 *           rail calls irreversible.
 */
export function CompanionView() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [steps, setSteps] = useState([])
  const [mode, setMode] = useState('ask')
  const [watching, setWatching] = useState(false)
  const [watchNote, setWatchNote] = useState('')
  const [pending, setPending] = useState(null)   // an action awaiting confirmation
  const abortRef = useRef(null)
  const watchRef = useRef(createWatchState())
  const bodyRef = useRef(null)

  const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_COMPANION_WIN__) || null

  // Mirror the live action feed the main window already publishes.
  useEffect(() => subscribeActivity((snap) => {
    setSteps(snap.steps.slice(-6))
    if (snap.answer) setReply(snap.answer)
  }), [])

  const send = useCallback(async (text) => {
    const msg = String(text ?? input).trim()
    if (!msg || busy) return
    setInput('')
    setBusy(true)
    setReply('')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''
    try {
      await streamMessage(
        { message: msg, signal: ctrl.signal, autonomous: mode === 'auto' },
        (t) => { acc += t; setReply(acc) },
        undefined,
        () => setBusy(false),
        (e) => { setReply(`Could not finish: ${e?.message || e}`); setBusy(false) },
      )
    } catch (e) {
      setReply(`Could not finish: ${e?.message || e}`)
      setBusy(false)
    }
  }, [input, busy, mode])

  const stop = useCallback(() => {
    try { abortRef.current?.abort() } catch { /* already gone */ }
    setBusy(false)
  }, [])

  // Screen watching. Paced by companion/watch so it cannot become a token
  // furnace: a look needs elapsed interval AND a changed screen AND budget.
  useEffect(() => {
    if (!watching) { setPaused(watchRef.current, true); return }
    setPaused(watchRef.current, false)
    let alive = true
    const tick = async () => {
      if (!alive || busy) return
      const cam = window.__YOGATIK_COMPANION__
      if (!cam?.captureScreen) { setWatchNote('Screen capture is desktop-only.'); return }
      const decision = shouldLook(watchRef.current, { now: Date.now(), hash: null })
      setWatchNote(decision.reason)
      if (!decision.look) return
      noteLook(watchRef.current, { now: Date.now() })
      send('Look at my screen. If there is something you can genuinely help with right now, say so in one short sentence and offer one concrete action. If not, reply exactly: NOTHING.')
    }
    const id = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [watching, busy, send])

  // Hide a "NOTHING" answer — an idle watcher should be silent, not chatty.
  const visibleReply = reply.trim() === 'NOTHING' ? '' : reply

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleReply, steps])

  return (
    <div className="companion">
      <div className="companion-bar">
        <GripHorizontal size={13} className="companion-grip" />
        <span className="companion-title">Yogatik</span>
        <button
          className={`companion-chip ${mode === 'auto' ? 'on' : ''}`}
          onClick={() => setMode(mode === 'auto' ? 'ask' : 'auto')}
          title={mode === 'auto'
            ? 'Autopilot: acts on its own, still stops before anything irreversible'
            : 'Ask first: proposes, waits for you'}
        >
          {mode === 'auto' ? <Zap size={12} /> : <ShieldCheck size={12} />}
          {mode === 'auto' ? 'Autopilot' : 'Ask first'}
        </button>
        <button
          className={`companion-icon ${watching ? 'on' : ''}`}
          onClick={() => setWatching((w) => !w)}
          title={watching ? 'Stop watching the screen' : 'Watch my screen and offer help'}
          aria-label="Toggle screen watching"
        >
          {watching ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button className="companion-icon" onClick={() => bridge()?.hide()} title="Hide (Ctrl+Shift+Space)" aria-label="Hide companion">
          <X size={14} />
        </button>
      </div>

      <div className="companion-body" ref={bodyRef}>
        {watching && <div className="companion-note">👁 {watchNote || 'Watching…'}</div>}

        {steps.length > 0 && (
          <div className="companion-steps">
            {steps.map((s) => (
              <div key={s.id} className={`companion-step ${s.status || ''}`}>
                <span>{s.name}</span>
                {s.ms != null && <span className="companion-ms">{(s.ms / 1000).toFixed(1)}s</span>}
              </div>
            ))}
          </div>
        )}

        {pending && (
          <div className="companion-confirm">
            <div className="companion-confirm-why">{pending.reason}</div>
            <div className="companion-confirm-actions">
              <button onClick={() => { pending.resolve(true); setPending(null) }}>Allow once</button>
              <button className="ghost" onClick={() => { pending.resolve(false); setPending(null) }}>Skip</button>
            </div>
          </div>
        )}

        {visibleReply
          ? <div className="companion-reply">{visibleReply}</div>
          : !busy && <div className="companion-idle">Ask me anything, or let me watch your screen.</div>}
        {busy && !visibleReply && <div className="companion-idle">Working…</div>}
      </div>

      <div className="companion-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={mode === 'auto' ? 'Give me a goal…' : 'Ask me something…'}
          aria-label="Message"
        />
        {busy
          ? <button onClick={stop} title="Stop" aria-label="Stop"><Square size={14} /></button>
          : <button onClick={() => send()} disabled={!input.trim()} title="Send" aria-label="Send"><Send size={14} /></button>}
      </div>
    </div>
  )
}

export default CompanionView
/** Exposed for tests: the rail the confirm dialog is driven by. */
export { classifyAction }
