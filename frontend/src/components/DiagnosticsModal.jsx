import React, { useState, useMemo, useEffect } from 'react'
import {
  AlertTriangle, Check, Copy, Trash2, X, ShieldAlert, Cpu,
  RefreshCw, Globe, Smartphone, Key, Zap, Sliders, ChevronDown, Wrench, Activity
} from 'lucide-react'
import { getErrorLog, clearErrorLog, getDiagnosticsReport, diagnoseError } from '../errorLog'
import { latencyReport } from '../telemetry'
import { report as liveReport } from '../live/metrics'
import { runSafetyScreenEval } from '../evalHarness'
import { db, getAgentTraces } from '../db'

function fmtMs(v) { return v == null ? '—' : `${Math.round(v)}ms` }

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

export function DiagnosticsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('diagnostics') // 'diagnostics' | 'traces'
  const [logs, setLogs] = useState(() => getErrorLog().slice().reverse())
  const [traces, setTraces] = useState([])
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('')
  const [expandedIndex, setExpandedIndex] = useState(null)
  const [expandedTraceIdx, setExpandedTraceIdx] = useState(null)
  // Observability snapshot: latency percentiles (this session) + safety-screen
  // eval pass rate (model-free regression over the golden set).
  const perf = useMemo(() => latencyReport(), [logs])
  const safety = useMemo(() => runSafetyScreenEval(), [])
  // Live had no instrumentation at all, so every decision about that module
  // was a guess. These are the six numbers from the roadmap and nothing else.
  const live = useMemo(() => liveReport(), [logs])
  const latTarget = perf.total.p95 != null && perf.total.p95 < 2000

  useEffect(() => {
    try {
      db.traces.orderBy('createdAt').reverse().limit(50).toArray()
        .then(t => setTraces((t || []).filter(item => item.status === 'error' || item.error)))
        .catch(() => {})
    } catch {}
  }, [activeTab])

  const handleClear = () => {
    if (activeTab === 'traces') {
      try { db.traces.clear(); setTraces([]) } catch {}
      return
    }
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

        {/* Tab Selector */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))', padding: '0 18px', background: 'var(--bg-input, rgba(0,0,0,0.15))' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setActiveTab('diagnostics')}
            style={{
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: activeTab === 'diagnostics' ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
              color: activeTab === 'diagnostics' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <AlertTriangle size={14} /> Errors &amp; Diagnostics ({logs.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'traces' ? 'active' : ''}`}
            onClick={() => setActiveTab('traces')}
            style={{
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: activeTab === 'traces' ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
              color: activeTab === 'traces' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <Activity size={14} /> Failed Tool Traces ({traces.length})
          </button>
        </div>

        {/* System Summary Bar */}
        <div style={{ padding: '10px 18px', background: 'var(--bg-input, rgba(0,0,0,0.25))', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary, #a1a1aa)' }}>
            <span>Network: <strong style={{ color: typeof navigator !== 'undefined' && navigator.onLine ? '#10b981' : '#ef4444' }}>{typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline'}</strong></span>
            {activeTab === 'diagnostics' ? (
              <span>Total Errors: <strong style={{ color: logs.length ? '#f59e0b' : '#10b981' }}>{logs.length}</strong></span>
            ) : (
              <span>Logged Tool Failures: <strong style={{ color: traces.length ? '#ef4444' : '#10b981' }}>{traces.length}</strong></span>
            )}
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
            {(activeTab === 'diagnostics' ? logs.length > 0 : traces.length > 0) && (
              <button
                type="button"
                className="error-btn-secondary"
                onClick={handleClear}
                title="Clear entries"
                style={{ padding: '4px 10px', fontSize: 11, color: '#ef4444' }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {activeTab === 'diagnostics' && (
          <>
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
                  <Activity size={13} /> <strong style={{ color: 'var(--text-primary)' }}>Live sessions</strong>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                    {live.sessions ? `${live.sessions} session${live.sessions === 1 ? '' : 's'}` : 'no data yet'}
                  </span>
                </div>
                {live.sessions ? (
                  <>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      First word P50 <strong style={{ color: 'var(--text-primary)' }}>{fmtMs(live.firstWordP50)}</strong> · P95 <strong style={{ color: 'var(--text-primary)' }}>{fmtMs(live.firstWordP95)}</strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {live.turnsPerSession} turns/session · {Math.round((live.over60sRate || 0) * 100)}% over 60s
                    </div>
                    {/* The strategic one: low camera use means Live is a voice
                        app competing on latency, which is the race it cannot win. */}
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Camera <strong style={{ color: (live.cameraOnRate ?? 0) >= 0.5 ? '#10b981' : '#f59e0b' }}>{Math.round((live.cameraOnRate || 0) * 100)}%</strong>
                      {' · '}tools <strong style={{ color: 'var(--text-primary)' }}>{Math.round((live.toolTurnRate || 0) * 100)}%</strong>
                      {live.bargeInFalsePositiveRate != null && <> · bad barge-in <strong style={{ color: live.bargeInFalsePositiveRate > 0.2 ? '#f59e0b' : 'var(--text-primary)' }}>{Math.round(live.bargeInFalsePositiveRate * 100)}%</strong></>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      ended: {Object.entries(live.endReasons).map(([k, v]) => `${k} ${v}`).join(' · ')}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Start a Live call to collect timings. Local only — never sent anywhere.</div>
                )}
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
          </>
        )}

        {activeTab === 'traces' && (
          <div className="palette-list" style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {traces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #71717a)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Check size={22} />
                </div>
                <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary, #f4f4f5)', fontSize: 14 }}>No Tool Failures Logged</h4>
                <p style={{ margin: 0, fontSize: 12 }}>Only failed tool executions are captured here for diagnostics and troubleshooting.</p>
              </div>
            ) : (
              traces.map((tr, idx) => {
                const isExpanded = expandedTraceIdx === idx
                const argStr = tr.args ? JSON.stringify(tr.args, null, 2) : ''

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
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: tr.status === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: tr.status === 'error' ? '#ef4444' : '#10b981'
                        }}>
                          {tr.status === 'error' ? '✕ FAILED' : '✓ SUCCESS'}
                        </span>
                        <strong style={{ fontSize: 12.5, color: 'var(--text-primary, #f4f4f5)' }}>{tr.tool}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #71717a)' }}>· {formatTime(tr.createdAt)}</span>
                      </div>

                      <button
                        type="button"
                        className="error-copy-btn"
                        onClick={() => setExpandedTraceIdx(isExpanded ? null : idx)}
                        style={{ padding: '2px 6px', fontSize: 10 }}
                      >
                        {isExpanded ? 'Hide Payload' : 'Inspect Trace'}
                      </button>
                    </div>

                    {tr.summary && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary, #cbd5e1)' }}>
                        {tr.summary}
                      </div>
                    )}
                    {tr.error && (
                      <div style={{ fontSize: 12, color: '#f87171' }}>
                        Error: {tr.error}
                      </div>
                    )}

                    {isExpanded && argStr && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>Input Arguments:</div>
                        <pre className="message-error-raw" style={{ margin: 0, fontSize: 11, maxHeight: 180, overflowY: 'auto' }}>
                          {argStr}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Footer */}
        <div className="palette-footer" style={{ padding: '10px 18px' }}>
          <span>Errors are preserved in an on-device local storage ring buffer.</span>
          <button className="small-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
