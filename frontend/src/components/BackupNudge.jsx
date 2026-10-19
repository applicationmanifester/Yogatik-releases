import React, { useEffect, useState } from 'react'
import { ShieldAlert, Download } from 'lucide-react'
import {
  getEvictionSafety, requestPersistence, markBackupNudged, formatBytes,
} from '../storage'
import ChatExportToolbar from './ChatExportToolbar'

/**
 * BackupNudge — eviction-safety warning + backup nudge.
 *
 * Everything lives in the browser: when storage is still best-effort (the
 * persist() bucket was not granted) the browser may evict the whole origin
 * under disk pressure with no warning and no undo. This card says so in
 * Settings, offers one click to request persistence, and — past a few
 * conversations — nudges a JSON backup via ChatExportToolbar (at most weekly,
 * never once persistence is granted; see storage.shouldNudgeBackup).
 */
export default function BackupNudge({ conversationCount = 0, conversation = null, onImport = null }) {
  const [safety, setSafety] = useState(null)
  const [fixing, setFixing] = useState(false)

  useEffect(() => {
    let live = true
    getEvictionSafety(conversationCount).then((s) => { if (live) setSafety(s) }).catch(() => {})
    return () => { live = false }
  }, [conversationCount])

  if (!safety || safety.persisted) return null

  const askPersist = async () => {
    setFixing(true)
    try {
      const ok = await requestPersistence()
      if (ok) {
        setSafety(await getEvictionSafety(conversationCount))
      }
    } finally {
      setFixing(false)
    }
  }

  const dismiss = () => {
    try { markBackupNudged() } catch { /* private mode */ }
    setSafety((s) => (s ? { ...s, nudgeDue: false } : s))
  }

  return (
    <div role="alert" aria-label="Storage eviction warning"
      style={{
        padding: '12px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.45)',
        background: 'rgba(245, 158, 11, 0.08)', display: 'flex',
        flexDirection: 'column', gap: 8, marginBottom: 12,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <strong style={{ fontSize: 12.5 }}>
          Browser storage is best-effort — your chats could be evicted under disk pressure.
        </strong>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        {safety.quota
          ? <>Using {formatBytes(safety.used)} of {formatBytes(safety.quota)}. </>
          : null}
        Make storage durable or keep a backup.
        {safety.nudgeDue
          ? <> You have {conversationCount} conversations — a one-click JSON backup takes seconds.</>
          : null}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="small-btn btn-primary" onClick={askPersist} disabled={fixing}
          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Download size={12} /> {fixing ? 'Requesting…' : 'Make storage durable'}
        </button>
        <ChatExportToolbar conversation={conversation} onImport={onImport} compact />
        {safety.nudgeDue && (
          <button type="button" className="small-btn" onClick={dismiss} style={{ fontSize: 11 }}>
            Remind me later
          </button>
        )}
      </div>
    </div>
  )
}
