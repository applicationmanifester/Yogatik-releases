import React, { useState, useMemo } from 'react'
import {
  AlertTriangle, Check, Copy, Trash2, X, ShieldAlert, Cpu,
  RefreshCw, Globe, Smartphone, Key, Zap, Sliders, ChevronDown
} from 'lucide-react'
import { getErrorLog, clearErrorLog, getDiagnosticsReport, diagnoseError } from '../errorLog'
import { latencyReport } from '../telemetry'
import { runSafetyScreenEval } from '../evalHarness'

function fmtMs(v) { return v == null ? '—' : `${Math.round(v)}ms` }

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

export function DiagnosticsModal({ onClose }) {
  const [logs, setLogs] = useState(() => getErrorLog().slice().reverse())
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('')
  const [expandedIndex, setExpandedIndex] = useState(null)
  // Observability snapshot: latency percentiles (this session) + safety-screen
  // eval pass rate (model-free regression over the golden set).
  const perf = useMemo(() => latencyReport(), [logs])
  const safety = useMemo(() => runSafetyScreenEval(), [])
  const latTarget = perf.total.p95 != null && perf.total.p95 < 2000

  const handleClear = () => {
    clearErrorLog()
    setLogs([])
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getDiagnosticsReport())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const filteredLogs = useMemo(() => {
    if (!filter.trim()) return logs
    const q = filter.toLowerCase()
    return logs.filter(l =>
      (l.message && l.message.toLowerCase().includes(q)) ||
      (l.kind && l.kind.toLowerCase().includes(q)) ||
      (l.stack && l.stack.toLowerCase().includes(q))
    )
  }, [logs, filter])

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette diagnostics-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Error Findings & Diagnostics Inspector"
        style={{ width: 'min(720px, 96%)', maxHeight: '82vh' }}
      >
        {/* Header */}
        <div className="palette-input-bar" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <AlertTriangle size={18} style={{ color: 'var(--accent, #ff6b35)' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #f4f4f5)' }}>
              Error Findings &amp; Diagnostics Inspector
            </h3>
          </div>
          <button
            type="button"
            className="palette-clear-btn"
            onClick={onClose}
            title="Close modal"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* System Summary Bar */}
        <div style={{ padding: '10px 18px', background: 'var(--bg-input, rgba(0,0,0,0.25))', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary, #a1a1aa)' }}>
            <span>Network: <strong style={{ color: typeof navigator !== 'undefined' && navigator.onLine ? '#10b981' : '#ef4444' }}>{typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline'}</strong></span>
            <span>Total Errors: <strong style={{ color: logs.length ? '#f59e0b' : '#10b981' }}>{logs.length}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="error-btn-secondary"
              onClick={handleCopy}
              title="Copy JSON Diagnostics Report"
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy Report'}</span>
            </button>
            {logs.length > 0 && (
              <button
                type="button"
                className="error-btn-secondary"
                onClick={handleClear}
                title="Clear all logged errors"
                style={{ padding: '4px 10px', fontSize: 11, color: '#ef4444' }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Observability: latency + safety eval */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
          <div style={{ flex: '1 1 200px', background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <Zap size={13} /> <strong style={{ color: 'var(--text-primary)' }}>Latency</strong>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: perf.samples ? (latTarget ? '#10b981' : '#f59e0b') : 'var(--text-muted)' }}>
                {perf.samples ? `${perf.samples} turn${perf.samples === 1 ? '' : 's'}` : 'no data yet'}
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              TTFB P50 <strong style={{ color: 'var(--text-primary)' }}>{fmtMs(perf.ttft.p50)}</strong> · P95 <strong style={{ color: 'var(--text-primary)' }}>{fmtMs(perf.ttft.p95)}</strong>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Total P50 <strong style={{ color: 'var(--text-primary)' }}>{fmtMs(perf.total.p50)}</strong> · P95 <strong style={{ color: latTarget ? '#10b981' : 'var(--text-primary)' }}>{fmtMs(perf.total.p95)}</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(target &lt; 2s)</span>
            </div>
          </div>
          <div style={{ flex: '1 1 160px', background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <ShieldAlert size={13} /> <strong style={{ color: 'var(--text-primary)' }}>Safety screen</strong>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Golden set: <strong style={{ color: safety.passRate === 1 ? '#10b981' : '#f59e0b' }}>{Math.round(safety.passRate * 100)}%</strong> ({safety.passed}/{safety.total})
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>crisis · boundary · quality · injection</div>
          </div>
        </div>

        {/* Search / Filter Filter Input if errors exist */}
        {logs.length > 0 && (
          <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter errors by keyword or provider..."
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                borderRadius: 6, color: 'var(--text-primary, #f4f4f5)', outline: 'none'
              }}
            />
          </div>
        )}

        {/* Logs List */}
        <div className="palette-list" style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #71717a)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Check size={22} />
              </div>
              <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary, #f4f4f5)', fontSize: 14 }}>No Errors Recorded</h4>
              <p style={{ margin: 0, fontSize: 12 }}>Your application and model sessions are running smoothly with no active errors.</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted, #71717a)', fontSize: 12 }}>
              No errors match your filter query.
            </div>
          ) : (
            filteredLogs.map((entry, idx) => {
              const diag = diagnoseError(entry.message)
              const isExpanded = expandedIndex === idx

              return (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`error-category-badge badge-${diag.type}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                        {diag.category}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #71717a)' }}>
                        {entry.kind} · {formatTime(entry.at)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="error-copy-btn"
                      onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                      style={{ padding: '2px 6px', fontSize: 10 }}
                    >
                      {isExpanded ? 'Hide Trace' : 'Details'}
                    </button>
                  </div>

                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary, #f4f4f5)', lineHeight: 1.4 }}>
                    {diag.title}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1.45 }}>
                    {diag.suggestion}
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <pre className="message-error-raw" style={{ margin: 0, fontSize: 11 }}>
                        {entry.message}
                        {entry.stack ? `\n\nStack:\n${entry.stack}` : ''}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="palette-footer" style={{ padding: '10px 18px' }}>
          <span>Errors are preserved in an on-device local storage ring buffer.</span>
          <button className="small-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
