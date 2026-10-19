import React, { useState, useEffect, useCallback } from 'react'
import { ScrollText, ShieldCheck, FileJson, FileSpreadsheet, Trash2 } from 'lucide-react'
import { queryEvents, verifyChain, exportAudit, wipeTrail } from '../auditTrail'

/**
 * AuditPanel — read/verify/export/wipe view over auditTrail.js
 *
 * Companion of the [audit] hooks in permissions.js, scheduler.js, chatExport.js
 * and api.js. Shows the LAST trail events (time chip, type label, coarse
 * detail), re-verifies the hash chain on demand, exports the full trail
 * (json keeps the chain, csv for humans) and wipes it after an explicit
 * two-step confirm — with no window.confirm(), so the click path is testable
 * and keyboard-driven the same way on desktop and web.
 */

const LABELS = {
  tool_permission_roll: 'Tool permission',
  schedule_created: 'Schedule created',
  schedule_paused: 'Schedule paused',
  schedule_resumed: 'Schedule resumed',
  schedule_cancelled: 'Schedule cancelled',
  schedule_ran: 'Schedule ran',
  data_export: 'Data export',
  data_import: 'Data import',
  prefs_push: 'Prefs pushed',
  prefs_pull: 'Prefs pulled',
  key_vault_pull: 'Key vault sync',
  cloud_sync: 'Cloud sync',
  mcp_toggled: 'MCP toggled',
  audit_wiped: 'Trail cleared',
}

const typeLabel = (t) => LABELS[t] || t

const timeChip = (at) => {
  if (!at) return '—'
  const d = new Date(at)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

/** Coarse detail → one short line. Never a body: the trail does not hold one. */
function fmtDetail(detail) {
  try {
    if (!detail || typeof detail !== 'object') return '—'
    const entries = Object.entries(detail)
    if (!entries.length) return '—'
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ').slice(0, 96)
  } catch {
    return '—'
  }
}

export default function AuditPanel() {
  const [events, setEvents] = useState([])
  const [verifyResult, setVerifyResult] = useState(null)
  const [status, setStatus] = useState('')
  const [wipeArmed, setWipeArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try { setEvents(await queryEvents({ limit: 30 })) } catch { /* trail is optional to the UI */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const onVerify = async () => {
    setBusy(true)
    try {
      const res = await verifyChain()
      setVerifyResult(res)
      setStatus(res.intact
        ? `Chain intact across ${res.length} event${res.length === 1 ? '' : 's'}.`
        : `Chain broken at event #${res.brokenAt + 1} of ${res.length}.`)    } catch {
      setVerifyResult(null)
      setStatus('Verification could not run.')
    } finally {
      setBusy(false)
    }
  }

  const onExport = async (format) => {
    setBusy(true)
    try {
      const res = await exportAudit(format)
      setVerifyResult(null)
      setStatus(res ? `Exported ${res.count} events to ${res.filename}.` : 'Export failed.')
      await refresh()
    } catch {
      setVerifyResult(null)
      setStatus('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const onWipe = async () => {
    if (!wipeArmed) { setWipeArmed(true); setStatus('Click again to wipe the trail.'); return }
    setWipeArmed(false)
    setBusy(true)
    try {
      const ok = await wipeTrail()
      setVerifyResult(null)
      setStatus(ok ? 'Trail wiped. The wipe itself is now the first recorded event.' : 'Wipe failed.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section-card" data-testid="audit-panel">
      <h4>Audit trail</h4>
      <div className="setting-row">
        <div className="setting-info">
          <span className="setting-name">What this app recorded about consequential decisions</span>
          <span className="setting-desc">
            A local, hash-chained log (last 500 entries) of tool-permission
            decisions, scheduled runs, data exports/imports, key-vault and
            preference syncs. Content, prompts and tool arguments are never
            recorded — only the event type and coarse booleans/ids. Team roles /
            RBAC need a backend and are not offered here.
          </span>
        </div>
        <ScrollText size={18} style={{ opacity: 0.7 }} aria-hidden="true" />
      </div>

      <div className="audit-table" data-testid="audit-rows" style={{ marginTop: 8 }}>
        {events.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }} data-testid="audit-empty">
            No events recorded yet.
          </p>
        )}
        {events.map((e, i) => (
          <div className="audit-row" key={`${e?.at ?? 'x'}-${i}`}
            style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid var(--border, #eee)', fontSize: 12 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {timeChip(e?.at)}
            </span>
            <span className="audit-type-chip" style={{ flex: '0 0 auto', fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'var(--accent-soft, #ffe3d4)', color: 'var(--accent, #ff6b35)' }}>
              {typeLabel(e?.type)}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fmtDetail(e?.detail)}>
              {fmtDetail(e?.detail)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <button className="settings-btn secondary sm" onClick={onVerify} disabled={busy} aria-label="Verify audit trail integrity">
          <ShieldCheck size={12} /> Verify integrity
        </button>
        <button className="settings-btn secondary sm" onClick={() => onExport('json')} disabled={busy} aria-label="Export audit trail as JSON">
          <FileJson size={12} /> Export JSON
        </button>
        <button className="settings-btn secondary sm" onClick={() => onExport('csv')} disabled={busy} aria-label="Export audit trail as CSV">
          <FileSpreadsheet size={12} /> Export CSV
        </button>
        <button
          className={`settings-btn sm ${wipeArmed ? 'primary' : 'secondary'}`}
          onClick={onWipe}
          disabled={busy}
          aria-label={wipeArmed ? 'Confirm wipe audit trail' : 'Wipe audit trail'}
          style={wipeArmed ? { color: 'var(--danger, #ef4444)' } : undefined}
        >
          <Trash2 size={12} /> {wipeArmed ? 'Confirm wipe' : 'Wipe trail'}
        </button>
      </div>

      <p role="status" aria-live="polite" data-testid="audit-status" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, minHeight: 16 }}>
        {verifyResult
          ? (verifyResult.intact ? '✓ Chain intact.' : `✗ Chain broken at #${verifyResult.brokenAt + 1}.`)
          : status}
      </p>
    </div>
  )
}
