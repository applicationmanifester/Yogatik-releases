import React, { useState, useEffect } from 'react'
import { Check, Copy, CheckCircle2 } from 'lucide-react'
import { getDiagnosticsReport, getErrorLog, clearErrorLog } from '../../errorLog'

export function DiagnosticsTab({
  activeProvider = 'nvidia',
  activeModel = '',
}) {
  const [copiedReport, setCopiedReport] = useState(false)
  const [errorLogs, setErrorLogs] = useState([])

  useEffect(() => {
    setErrorLogs(getErrorLog().slice(0, 15))
  }, [])

  const handleCopyDiagnostics = () => {
    const report = getDiagnosticsReport()
    navigator.clipboard?.writeText(JSON.stringify(report, null, 2))
    setCopiedReport(true)
    setTimeout(() => setCopiedReport(false), 2000)
  }

  return (
    <section className="settings-pane">
      <div className="settings-pane-header">
        <div>
          <h3 className="settings-pane-title">System Diagnostics &amp; Health</h3>
          <p className="settings-pane-subtitle">
            Inspect error logs, network latency reports, and export diagnostics for pairing &amp; troubleshooting.
          </p>
        </div>
        <button className="settings-btn secondary" onClick={handleCopyDiagnostics}>
          {copiedReport ? <Check size={13} /> : <Copy size={13} />}
          {copiedReport ? 'Copied to Clipboard!' : 'Copy Diagnostics Report'}
        </button>
      </div>

      <div className="settings-section-card">
        <h4>Environment Status</h4>
        <div className="diagnostics-summary-grid">
          <div className="diag-stat-card">
            <span className="diag-stat-label">Platform</span>
            <span className="diag-stat-val">Desktop (Electron)</span>
          </div>
          <div className="diag-stat-card">
            <span className="diag-stat-label">Active Provider</span>
            <span className="diag-stat-val">{activeProvider}</span>
          </div>
          <div className="diag-stat-card">
            <span className="diag-stat-label">Active Model</span>
            <span className="diag-stat-val" style={{ fontSize: 11 }}>{activeModel || 'Auto'}</span>
          </div>
          <div className="diag-stat-card">
            <span className="diag-stat-label">System Health</span>
            <span className="diag-stat-val text-green">Optimal</span>
          </div>
        </div>
      </div>

      <div className="settings-section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4>Recent Event &amp; Error Log</h4>
          {errorLogs.length > 0 && (
            <button className="settings-btn ghost sm" onClick={() => { clearErrorLog(); setErrorLogs([]) }}>
              Clear Log
            </button>
          )}
        </div>
        {errorLogs.length === 0 ? (
          <div className="settings-empty-logs">
            <CheckCircle2 size={16} className="text-green" /> No errors recorded. System running smoothly.
          </div>
        ) : (
          <div className="settings-log-viewer">
            {errorLogs.map((log, idx) => (
              <div key={idx} className="settings-log-item">
                <span className="log-time">{new Date(log.time || Date.now()).toLocaleTimeString()}</span>
                <span className="log-msg">{log.message || JSON.stringify(log)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
