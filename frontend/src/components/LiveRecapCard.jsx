/**
 * [live-recording] Post-call recap card — Horizon-1 item 4.
 *
 * A voice call that leaves nothing behind is a call you cannot act on
 * afterwards. This card IS the leave-behind: when the call ends, Live shows it
 * instead of closing instantly, built from live/sessionHandoff's pure
 * deliverable helpers (executive summary, action items) plus the recording's
 * tool event list (artefacts produced) and any cited URLs. Two CTAs do the
 * handoff:
 *   • "Save to conversation" → persists the recap through the SAME message-save
 *     path every spoken turn already uses (LiveView's onTranscript → App's
 *     saveLiveTurn → saveMessage), so the completed call lands in the call's
 *     conversation like any other turn; and
 *   • "Copy" → clipboard, for taking it anywhere else on the spot.
 * Dismissing the card proceeds with the normal call end (App's onEnd handoff).
 * When a recording exists, the card gains a Playback toggle that opens
 * LiveRecordingPlayer over the card.
 */
import React, { useEffect, useRef, useState } from 'react'
import { X, Save, Copy, Play } from 'lucide-react'
import LiveRecordingPlayer from './LiveRecordingPlayer'

function Row({ children }) {
  return <li className="live-rec-card-row">{children}</li>
}

function Section({ title, empty, children }) {
  return (
    <section className="live-rec-card-section">
      <h4>{title}</h4>
      {children}
      {empty && <p className="live-rec-card-empty">—</p>}
    </section>
  )
}

export function LiveRecapCard({ recap, onSave, onClose }) {
  const { markdown = '', summary = [], actions = [], artefacts = [], sources = [], recording = null } = recap || {}
  const [playerOpen, setPlayerOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  // While the player is open it is the top layer: Escape unwinds IT first, and
  // only then the card (awnerRef keeps the current layer without re-subscribing).
  const layerRef = useRef({ playerOpen, onSave, onClose })
  layerRef.current = { playerOpen, onSave, onClose }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const layer = layerRef.current
      if (layer.playerOpen) setPlayerOpen(false)
      else layer.onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleSave = async () => {
    try { await onSave?.(markdown) } catch { /* the card stays open either way */ }
    setSaved(true)
  }

  const handleCopy = () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      navigator.clipboard.writeText(markdown).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }).catch(() => {})
    } catch { /* clipboard is a nice-to-have; the card carries the text anyway */ }
  }

  if (!markdown && !summary.length && !actions.length && !artefacts.length && !recording) return null

  return (
    <div className="vision-modal-overlay" style={{ zIndex: 500 }} onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="live-rec-card" role="dialog" aria-modal="true" aria-label="Live session recap">
        <div className="live-rec-card-head">
          <h3>Session recap</h3>
          <button type="button" className="live-rec-card-close" onClick={onClose} aria-label="Close recap">
            <X size={16} />
          </button>
        </div>

        <div className="live-rec-card-body">
          <Section title="Executive summary" empty={!summary.length}>
            <ul className="live-rec-card-list">
              {summary.map((s, i) => <Row key={i}>{s}</Row>)}
            </ul>
          </Section>

          <Section title="Action items" empty={!actions.length}>
            <ul className="live-rec-card-list live-rec-card-todos">
              {actions.map((a, i) => <Row key={i}>{a}</Row>)}
            </ul>
          </Section>

          <Section title="Artefacts produced" empty={!artefacts.length}>
            <ul className="live-rec-card-list live-rec-card-artefacts">
              {artefacts.map((a, i) => <Row key={i}>{a}</Row>)}
            </ul>
          </Section>

          <Section title="Sources & cited links" empty={!sources.length}>
            <ul className="live-rec-card-list">
              {sources.map((u, i) => (
                <Row key={i}>
                  <a href={u} target="_blank" rel="noreferrer noopener">{u}</a>
                </Row>
              ))}
            </ul>
          </Section>

          {/* The full structured brief, identical to what "Save" writes. */}
          <div className="live-rec-card-md" data-testid="live-recap-markdown">{markdown}</div>
        </div>

        <div className="live-rec-card-actions">
          <button type="button" className="live-rec-btn is-primary" onClick={handleSave}>
            <Save size={14} /> {saved ? 'Saved ✓' : 'Save to conversation'}
          </button>
          <button type="button" className="live-rec-btn" onClick={handleCopy}>
            <Copy size={14} /> {copied ? 'Copied ✓' : 'Copy'}
          </button>
          {recording && (
            <button
              type="button"
              className="live-rec-btn"
              onClick={() => setPlayerOpen(v => !v)}
              aria-expanded={playerOpen}
              aria-controls="live-recap-player"
            >
              <Play size={14} /> {playerOpen ? 'Hide playback' : 'Playback'}
            </button>
          )}
        </div>

        <div id="live-recap-player">
          {recording && playerOpen && (
            <LiveRecordingPlayer recording={recording} onClose={() => setPlayerOpen(false)} />
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveRecapCard
