import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Wrench, AlertTriangle } from 'lucide-react'
import { createLiveSession } from '../live/session'
import { createCascadeSession } from '../live/cascade'

/**
 * Full-screen face-to-face call.
 *
 * Their camera is the backdrop; the model is an orb that moves with its own
 * voice. Captions are live transcripts, not a chat log — they scroll away,
 * because reading a transcript while talking is not how a conversation works.
 */
export function LiveView({ engine = 'gemini', provider, apiKey, model, voice, persona, disabledTools, modelCanSee, onEnd, onTranscript }) {
  const [state, setState] = useState('connecting')   // connecting | live | error | ended
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [camOn, setCamOn] = useState(true)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [tool, setTool] = useState(null)
  const [lines, setLines] = useState([])             // {role, text}

  const videoRef = useRef(null)
  const sessionRef = useRef(null)
  const turnRef = useRef({ role: null, text: '' })

  /** Transcript deltas arrive fragmented; merge into the current speaker's line. */
  const pushDelta = useCallback((role, text) => {
    setLines((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === role) {
        const merged = [...prev]
        merged[merged.length - 1] = { role, text: last.text + text }
        return merged.slice(-6)
      }
      return [...prev, { role, text }].slice(-6)
    })
    const t = turnRef.current
    if (t.role === role) t.text += text
    else {
      if (t.role && t.text.trim()) onTranscript?.(t.role, t.text.trim())
      turnRef.current = { role, text }
    }
  }, [onTranscript])

  useEffect(() => {
    let cancelled = false
    // Two engines behind one UI: Gemini's realtime socket, or the cascade
    // (recognition -> agent -> synthesis) that works with any other provider.
    const make = engine === 'gemini' ? createLiveSession : createCascadeSession
    const session = make({
      provider, apiKey, model, voice, persona, disabledTools, modelCanSee, camera: true,
      onEvent: (e) => {
        if (cancelled) return
        switch (e.type) {
          case 'ready': setState('live'); break
          case 'camera':
            if (videoRef.current) videoRef.current.srcObject = e.stream
            break
          case 'level': setLevel(e.value); break
          case 'speaking': setSpeaking(e.value); break
          case 'transcript': pushDelta(e.role, e.text); break
          case 'tools': setTool(e.names.join(', ')); break
          case 'toolResult': setTool(null); break
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
    // Started once per mounted call — restarting on prop churn would drop the session.
  }, [])

  const toggleMute = () => {
    const v = !muted
    setMuted(v)
    sessionRef.current?.setMuted(v)
  }
  const toggleCam = async () => {
    const v = !camOn
    setCamOn(v)
    await sessionRef.current?.enableCamera(v)
    if (!v && videoRef.current) videoRef.current.srcObject = null
  }

  // Orb scale tracks the model's own output level — it looks like it is speaking
  // because it literally is.
  const orbScale = 1 + (speaking ? level * 0.5 : 0)

  return (
    <div className="live-view" role="dialog" aria-modal="true" aria-label="Live conversation">
      <video ref={videoRef} className={`live-self ${camOn ? '' : 'off'}`} autoPlay playsInline muted />

      <div className="live-orb-wrap">
        <div
          className={`live-orb ${speaking ? 'speaking' : ''} ${state === 'connecting' ? 'pending' : ''}`}
          style={{ transform: `scale(${orbScale})` }}
        />
        {state === 'connecting' && (
          <div className="live-status"><Loader2 size={14} className="spin" /> Connecting…</div>
        )}
        {tool && <div className="live-status"><Wrench size={14} /> {tool}</div>}
      </div>

      {state === 'error' && (
        <div className="live-error">
          <AlertTriangle size={18} />
          <p>{error}</p>
          <button className="btn" onClick={onEnd}>Close</button>
        </div>
      )}

      <div className="live-captions" aria-live="polite">
        {lines.map((l, i) => (
          <p key={i} className={`live-caption ${l.role}`}>
            <span>{l.text}</span>
          </p>
        ))}
      </div>

      <div className="live-controls">
        <button
          className={`live-btn ${muted ? 'off' : ''}`}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
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
      </div>
    </div>
  )
}
