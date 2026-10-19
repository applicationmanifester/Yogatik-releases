/**
 * [live-recording] Playback for one recorded Live call.
 *
 * A recording is small by construction (≤12 thumbnails, turn text, tool
 * events), so the player is deliberately plain: a LOCAL timeline plus the
 * transcript rail, driven by clicks and keys. There are no network calls and
 * no <video>/<audio> — frames are data URLs captured on-device; the timeline
 * is just a scrubber over the rows that already exist in the recording object
 * handed to it.
 */
import React, { useMemo, useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

const STEP_MS = 5000   // ArrowLeft/ArrowRight jump

/** Renders a single stage frame; a missing thumbnail degrades to a note. */
function StageFrame({ frame }) {
  if (frame?.thumb) {
    return <img className="live-rec-frame" src={frame.thumb} alt={`Scene at ${Math.round((frame.at || 0) / 1000)}s`} />
  }
  return (
    <div className="live-rec-frame live-rec-frame-empty" aria-label="No frame captured" />
  )
}

/** Relative wall time shown on the stage: 0:04 */
function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function LiveRecordingPlayer({ recording, onClose }) {
  const { turns = [], toolEvents = [], frames = [], durationSec = 0, provider, model } = recording || {}

  // The scrubber range: the known duration, or the last recorded moment,
  // whichever reaches further — a transcript-only recording still plays.
  const totalMs = useMemo(() => {
    let last = 0
    for (const t of turns) last = Math.max(last, t.at || 0)
    for (const e of toolEvents) last = Math.max(last, e.at || 0)
    for (const f of frames) last = Math.max(last, f.at || 0)
    const rec = (Number.isFinite(durationSec) ? durationSec : 0) * 1000
    return Math.max(rec, last) || 0
  }, [turns, toolEvents, frames, durationSec])

  const [t, setT] = useState(0)
  const trackRef = useRef(null)

  // Frame shown = the newest frame at or before the playhead (call start frame default).
  const frameAt = useMemo(() => {
    let best = null
    for (const f of frames) if ((f.at || 0) <= t && (!best || (f.at || 0) >= (best.at || 0))) best = f
    return best || frames[0] || null
  }, [frames, t])

  // Active transcript row = the newest turn at or before the playhead.
  const activeTurnAt = useMemo(() => {
    let best = -1
    for (const turn of turns) if ((turn.at || 0) <= t && (turn.at || 0) > best) best = turn.at || 0
    return best
  }, [turns, t])

  const goTo = useCallback((ms) => {
    setT(Math.max(0, Math.min(totalMs, Math.round(ms))))
  }, [totalMs])

  const onTrackKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); goTo(t + STEP_MS); return }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); goTo(t - STEP_MS); return }
    if (e.key === 'Home') { e.preventDefault(); goTo(0); return }
    if (e.key === 'End') { e.preventDefault(); goTo(totalMs) }
  }, [t, totalMs, goTo])

  const onTrackPointer = useCallback((e) => {
    // Click-to-seek. jsdom rects are 0-wide; a degenerate rect must seek to 0,
    // never NaN.
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = rect && rect.width > 0 ? rect.width : 0
    const x = typeof e.clientX === 'number' && width ? (e.clientX - rect.left) / width : 0
    const frac = Math.max(0, Math.min(1, x))
    goTo(frac * totalMs)
  }, [totalMs, goTo])

  const pct = (ms) => (totalMs > 0 ? Math.max(0, Math.min(100, ((ms || 0) / totalMs) * 100)) : 0)

  if (!recording) return null

  return (
    <div className="live-rec-player" role="dialog" aria-label="Live recording playback">
      <div className="live-rec-player-head">
        <span className="live-rec-player-title">
          Recording {fmt(t)} / {fmt(totalMs)}
          {model ? <span className="live-rec-player-sub"> · {String(model).split('/').pop()} ({provider || 'live'})</span> : null}
        </span>
        <button type="button" className="live-rec-player-close" onClick={onClose} aria-label="Close playback">
          <X size={16} />
        </button>
      </div>

      <div className="live-rec-player-body">
        <div className="live-rec-stage">
          <StageFrame frame={frameAt} />
          <div className="live-rec-stage-time" aria-hidden="true">{t > 0 ? `+${fmt(t)}` : 'start'}</div>
          {!frames.length && (
            <p className="live-rec-stage-note">No frames were captured for this call (text-only recording).</p>
          )}
        </div>

        {/* Transcript rail — every row jumps the playhead to its own moment. */}
        <div className="live-rec-rail" role="list" aria-label="Recorded transcript">
          {turns.map((turn, i) => (
            <button
              key={i}
              type="button"
              role="listitem"
              className={`live-rec-row${(turn.at || 0) === activeTurnAt ? ' is-active' : ''}`}
              onClick={() => goTo(turn.at || 0)}
              aria-label={`${turn.speaker === 'user' ? 'You' : 'Assistant'} at ${fmt(turn.at || 0)}: jump to ${Math.round((turn.at || 0) / 1000)}s`}
            >
              <span className="live-rec-row-who">{turn.speaker === 'user' ? 'You' : 'AI'}</span>
              <span className="live-rec-row-text">{turn.text}</span>
              <span className="live-rec-row-time">{fmt(turn.at || 0)}</span>
            </button>
          ))}
          {!turns.length && <p className="live-rec-rail-note">No spoken turns recorded.</p>}
        </div>
      </div>

      {/* Frame-scrubber timeline with tool-event markers. Click seeks; the
          keyboard steps the playhead (slider semantics). */}
      <div
        ref={trackRef}
        className="live-rec-track-wrap"
        onPointerDown={onTrackPointer}
      >
        <div
          className="live-rec-track"
          role="slider"
          tabIndex={0}
          aria-label="Recording timeline"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(totalMs / 1000))}
          aria-valuenow={Math.round(t / 1000)}
          aria-valuetext={`${fmt(t)} of ${fmt(totalMs)}`}
          onKeyDown={onTrackKeyDown}
        >
          <div className="live-rec-track-fill" style={{ width: `${pct(t)}%` }} aria-hidden="true" />
          {frames.map((f, i) => (
            <span key={i} className="live-rec-tick" style={{ left: `${pct(f.at || 0)}%` }} title={`Frame at ${fmt(f.at || 0)}`} />
          ))}
        </div>
        {toolEvents.map((e, i) => (
          <button
            key={i}
            type="button"
            className={`live-rec-marker${e.kind === 'result' ? ' is-result' : ''}`}
            style={{ left: `${pct(e.at || 0)}%` }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => goTo(e.at || 0)}
            aria-label={`${e.kind === 'result' ? 'Tool result' : 'Tool call'} ${e.name} at ${fmt(e.at || 0)}`}
            title={`${e.kind === 'result' ? 'Tool result' : 'Tool call'}: ${e.name} · ${fmt(e.at || 0)}`}
          >
            <span className="live-rec-marker-dot" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default LiveRecordingPlayer
