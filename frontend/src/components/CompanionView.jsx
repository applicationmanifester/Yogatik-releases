import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Eye, EyeOff, Zap, ShieldCheck, Square, GripHorizontal, Pin, PinOff } from 'lucide-react'
import { streamMessage } from '../api'
import { subscribeActivity } from '../activityStream'
import { createWatchState, shouldLook, noteLook, setPaused } from '../companion/watch'
import { hashDataUrl } from '../companion/screenHash'
import { createActionGate, MODES } from '../companion/gate'

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
  const [pinned, setPinned] = useState(true)
  const abortRef = useRef(null)
  const watchRef = useRef(createWatchState())
  const bodyRef = useRef(null)
  const shellRef = useRef(null)
  const contentRef = useRef(null)
  const barRef = useRef(null)
  const inputBarRef = useRef(null)
  const inputRef = useRef(null)

  const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_COMPANION_WIN__) || null
  // On the web this whole surface is a preview: there is no window to hide, pin
  // or resize, and nothing can see the screen. Say so instead of offering dead
  // buttons.
  const isFloatingWindow = !!bridge()
  const canSeeScreen = typeof window !== 'undefined' && !!window.__YOGATIK_COMPANION__?.captureScreen

  // The gate asks by putting a card on screen and WAITING for the click. The
  // promise it returns is what the Allow/Skip buttons resolve, so an action is
  // genuinely blocked until a human answers rather than merely announced.
  const askUser = useCallback(({ reason, risk, step }) => new Promise((resolve) => {
    setPending({ reason, risk, step, resolve })
  }), [])

  const gateRef = useRef(null)
  if (!gateRef.current) {
    gateRef.current = createActionGate({ mode: MODES.ASK, confirm: askUser })
  }
  // Flipping the chip must change what the RUNNING gate does, not just the label.
  useEffect(() => {
    gateRef.current.setMode(mode === 'auto' ? MODES.AUTO : MODES.ASK)
  }, [mode])

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
    // A half-answered question must not outlive the run that asked it.
    setPending((p) => { try { p?.resolve(false) } catch { /* ignore */ } return null })
    setBusy(false)
  }, [])

  // The agent runs in this window, so hand it the gate. Anything that routes
  // tool calls through window.__YOGATIK_ACTION_GATE__ is checked before it runs;
  // without this the classifier would be decoration.
  useEffect(() => {
    window.__YOGATIK_ACTION_GATE__ = gateRef.current
    return () => { delete window.__YOGATIK_ACTION_GATE__ }
  }, [])

  // Screen watching. Paced by companion/watch so it cannot become a token
  // furnace: a look needs elapsed interval AND a changed screen AND budget.
  //
  // The screen fingerprint is the part that was missing. This used to call
  // shouldLook({ hash: null }) — the "no fingerprint available" branch — so the
  // change gate never ran and an untouched desktop still spent a vision call
  // every 20s until the hourly budget was gone. A local capture + 64-bit aHash
  // costs nothing next to the call it avoids.
  useEffect(() => {
    if (!watching) { setPaused(watchRef.current, true); return }
    setPaused(watchRef.current, false)
    let alive = true
    const tick = async () => {
      if (!alive || busy) return
      const cam = window.__YOGATIK_COMPANION__
      if (!cam?.captureScreen) { setWatchNote('Screen capture is desktop-only.'); return }

      // Cheap pre-check first: if it is too soon or the budget is spent there is
      // no reason to capture at all.
      const early = shouldLook(watchRef.current, { now: Date.now(), hash: watchRef.current.lastHash })
      if (!early.look && early.reason !== 'Screen has not changed.') {
        setWatchNote(early.reason)
        return
      }

      let hash = null
      try {
        const shot = await cam.captureScreen()
        if (!alive) return
        if (!shot?.success) { setWatchNote(shot?.error || 'Could not capture the screen.'); return }
        hash = await hashDataUrl(shot.dataUrl)
      } catch (e) {
        setWatchNote(`Could not capture the screen: ${e?.message || e}`)
        return
      }
      if (!alive || busy) return

      const decision = shouldLook(watchRef.current, { now: Date.now(), hash })
      setWatchNote(decision.reason)
      if (!decision.look) return
      // Record the hash, or every tick is a "first look" forever.
      noteLook(watchRef.current, { now: Date.now(), hash })
      send('Look at my screen. If there is something you can genuinely help with right now, say so in one short sentence and offer one concrete action. If not, reply exactly: NOTHING.')
    }
    const id = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [watching, busy, send])

  // The window follows the content. A frameless transparent window that keeps
  // its full height around a one-line answer leaves a dead transparent slab
  // sitting over the user's other apps, swallowing their clicks. Main clamps
  // this and grows upward from the bottom edge, so a bottom-docked companion
  // stays put; height is deliberately NOT part of the remembered bounds.
  useEffect(() => {
    const content = contentRef.current
    const b = bridge()
    if (!content || !b?.resize || typeof ResizeObserver !== 'function') return
    let last = 0
    let frame = 0
    const fit = () => {
      frame = 0
      const chrome = (barRef.current?.offsetHeight || 0) + (inputBarRef.current?.offsetHeight || 0)
      // Cap the growth here as well as in main: a long answer should scroll
      // inside the companion, not turn it into a full-screen pane.
      const height = Math.ceil(Math.min(chrome + content.scrollHeight + 2, 620))
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

  // Ctrl+Alt+C copies whatever the user has selected in ANOTHER application.
  // When this window is the one on screen, main relays it here rather than to
  // the main window — the point of the companion is not having to go back to
  // the app.
  useEffect(() => {
    const off = bridge()?.onSelection?.(({ text } = {}) => {
      const t = String(text || '').trim()
      if (!t) return
      setInput(t)
      // Do NOT auto-send: a stray selection turning into a paid turn (and, in
      // autopilot, into actions) is not something the user asked for.
      try { inputRef.current?.focus() } catch { /* not mounted yet */ }
    })
    return off
  }, [])

  // Hide a "NOTHING" answer — an idle watcher should be silent, not chatty.
  const visibleReply = reply.trim() === 'NOTHING' ? '' : reply

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleReply, steps])

  return (
    <div className="companion" ref={shellRef}>
      <div className="companion-bar" ref={barRef}>
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
          disabled={!canSeeScreen}
          title={!canSeeScreen
            ? 'Watching your screen needs the desktop app'
            : watching ? 'Stop watching the screen' : 'Watch my screen and offer help'}
          aria-label="Toggle screen watching"
        >
          {watching ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        {isFloatingWindow && (
          <button
            className={`companion-icon ${pinned ? 'on' : ''}`}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Pinned above other windows — click to unpin' : 'Stay above other windows'}
            aria-label="Toggle always on top"
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
        {/* One wrapper so the window can measure the NATURAL height of the
            content: .companion-body is flex-sized to the window, so observing
            it would only ever report the height it already has. */}
        <div ref={contentRef}>
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
            <div className="companion-confirm-why">
              <strong>{pending.risk === 'confirm' ? 'Needs your OK' : 'Confirm'}</strong>
              <div>{pending.reason}</div>
            </div>
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
      </div>

      <div className="companion-input" ref={inputBarRef}>
        <input
          ref={inputRef}
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
export { createActionGate }
