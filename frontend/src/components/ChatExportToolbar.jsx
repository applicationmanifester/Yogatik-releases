import React, { useRef, useState } from 'react'
import { Download, Upload, FileJson, FileText } from 'lucide-react'
import {
  downloadChat, downloadConversationJson, importConversationFile,
} from '../chatExport'
import { markBackedUp } from '../storage'

/**
 * ChatExportToolbar — one-click conversation export/import.
 *
 * Reuses chatExport.js builders (Markdown/HTML/PDF/JSON share textOf/who, so
 * multimodal parts normalise identically everywhere). JSON round-trips
 * losslessly for backup; PDF is the human-readable share format.
 */
export default function ChatExportToolbar({ conversation, onImport, compact = false }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

  const say = (t) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 3500)
  }

  const doExport = async (format) => {
    if (!conversation) { say('Nothing to export yet.'); return }
    try {
      if (format === 'json') downloadConversationJson(conversation)
      else await downloadChat(conversation, format)
      try { markBackedUp() } catch { /* best-effort */ }
      say(format === 'json' ? 'Exported JSON backup.' : `Exported ${format.toUpperCase()}.`)
    } catch (e) {
      say(`Export failed: ${e?.message || e}`)
    }
  }

  const doImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const conv = await importConversationFile(file)
      try { markBackedUp() } catch { /* best-effort */ }
      onImport?.(conv)
      say(`Imported “${conv.title}” (${conv.messages.length} messages).`)
    } catch (err) {
      say(err?.message || 'Import failed.')
    }
  }

  const btn = {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
    padding: compact ? '4px 8px' : '6px 10px',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="small-btn" style={btn} title="One-click JSON backup (lossless)"
        onClick={() => doExport('json')}>
        <FileJson size={12} /> JSON
      </button>
      <button type="button" className="small-btn" style={btn} title="Export as PDF (readable share)"
        onClick={() => doExport('pdf')}>
        <FileText size={12} /> PDF
      </button>
      <button type="button" className="small-btn" style={btn} title="Export as Markdown"
        onClick={() => doExport('md')}>
        <Download size={12} /> MD
      </button>
      <button type="button" className="small-btn" style={btn} title="Import a JSON conversation backup"
        onClick={() => fileRef.current?.click()}>
        <Upload size={12} /> Import
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={doImport} />
      {msg && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{msg}</span>}
    </div>
  )
}
