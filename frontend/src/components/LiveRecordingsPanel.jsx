/**
 * [live-recording] Saved-call recordings panel — the storage surface.
 *
 * Rendered inside the Live "more" sheaf when liveRecording is on. It reads the
 * persistent `live_recordings` store (db.js) itself, so the panel owns the
 * full round trip: list ↔ play ↔ export ↔ delete — the same self-fetching
 * contract AuditPanel holds.
 *
 * Export is a per-row, explicit ask: it reuses chatExport's downloadBlob — the
 * exact download plumbing every other export uses, including its
 * [audit] data_export note.
 */
import React, { useEffect, useState } from 'react'
import { Play, Download, Trash2 } from 'lucide-react'
import { downloadBlob } from '../chatExport'
import {
  getLiveRecordings, getLiveRecording, deleteLiveRecording,
} from '../db'
import { bytesLabel } from '../live/recording'

const when = (ts) => {
  try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
const dur = (s) => {
  const total = Math.max(0, Math.round(Number(s) || 0))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function LiveRecordingsPanel({ onPlay, onError }) {
  const [rows, setRows] = useState(null)   // null = still loading, [] = none yet
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let live = true
    getLiveRecordings()
      .then(r => { if (live) setRows(Array.isArray(r) ? r : []) })
      .catch(() => { if (live) { setLoadFailed(true) } })
    return () => { live = false }
  }, [])

  const play = async (id) => {
    const rec = await getLiveRecording(id)
    if (rec) onPlay?.(rec)
  }

  const exportRow = (r) => {
    try {
      const json = { ...r, format: 'yogatik-live-recording', exportedAt: new Date().toISOString() }
      const name = `yogatik-live-recording-${r?.id || Date.now()}.json`
      downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), name)
    } catch (e) { onError?.(e) }
  }

  const removeRow = async (r) => {
    try {
      await deleteLiveRecording(r?.id)
      setRows(prev => (prev || []).filter(x => x?.id !== r?.id))
    } catch (e) {
      // Deleting is best-effort; if the row is already gone the list is right,
      // otherwise re-reading gives the honest state.
      try { setRows(await getLiveRecordings()) } catch { onError?.(e) }
    }
  }

  if (loadFailed) {
    return <p className="live-rec-panel-note">Recordings could not be read from this browser.</p>
  }
  if (rows === null) return null
  if (!rows.length) {
    return <p className="live-rec-panel-note">No recordings from past calls yet.</p>
  }

  return (
    <ul className="live-rec-panel" data-testid="live-recordings-panel">
      {rows.map((r) => {
        const frames = Array.isArray(r?.frames) ? r.frames.length : 0
        const turns = Array.isArray(r?.turns) ? r.turns.length : 0
        return (
          <li key={r?.id ?? when(r?.startedAt)} className="live-rec-panel-row">
            <span className="live-rec-panel-when" title={`${turns} turns · ${frames} frames`}>
              {when(r?.startedAt)} · {dur(r?.durationSec)} · {bytesLabel(r?.sizeBytes)}
            </span>
            <span className="live-rec-panel-actions">
              <button type="button" className="live-rec-mini" onClick={() => play(r?.id)} aria-label={`Play recording from ${when(r?.startedAt)}`}>
                <Play size={13} /> Play
              </button>
              <button type="button" className="live-rec-mini" onClick={() => exportRow(r)} aria-label={`Export recording from ${when(r?.startedAt)} as JSON`}>
                <Download size={13} /> Export
              </button>
              <button type="button" className="live-rec-mini is-danger" onClick={() => removeRow(r)} aria-label={`Delete recording from ${when(r?.startedAt)}`}>
                <Trash2 size={13} /> Delete
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default LiveRecordingsPanel
