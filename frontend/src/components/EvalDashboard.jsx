import React, { useState, useMemo } from 'react'
import { ShieldCheck, Award, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Layers, Zap } from 'lucide-react'
import { GOLDEN_SET, gradeSafetyScreen, gradeResponse } from '../evalHarness'
import { latencyReport } from '../telemetry'

export function EvalDashboard({ onClose }) {
  const [evaluating, setEvaluating] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')

  const safetyResults = useMemo(() => {
    return GOLDEN_SET.map(c => gradeSafetyScreen(c))
  }, [evaluating])

  const passCount = safetyResults.filter(r => r.pass).length
  const passRate = Math.round((passCount / GOLDEN_SET.length) * 100)
  const latency = latencyReport()

  const categories = ['all', ...Array.from(new Set(GOLDEN_SET.map(c => c.category)))]

  const displayedCases = GOLDEN_SET.filter(c => filterCategory === 'all' || c.category === filterCategory)

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette eval-dashboard-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Evaluation & Quality Dashboard"
        style={{ width: 'min(720px, 95%)', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="palette-input-bar" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Award size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Golden-Set Evaluation &amp; Safety Dashboard</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Safety Screen Recall</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: passRate >= 95 ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={20} /> {passRate}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{passCount} of {GOLDEN_SET.length} test cases passing</div>
            </div>

            <div style={{ padding: 14, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>TTFB Latency (P50 / P95)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={20} /> {latency.ttft.p50 != null ? `${Math.round(latency.ttft.p50)}ms` : '<2s'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>P95: {latency.ttft.p95 != null ? `${Math.round(latency.ttft.p95)}ms` : '<5s'}</div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Layers size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Filter Category:</span>
            {categories.map(cat => (
              <button
                key={cat}
                className={`onb-pill ${filterCategory === cat ? 'selected' : ''}`}
                onClick={() => setFilterCategory(cat)}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, textTransform: 'capitalize' }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Test Case Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayedCases.map((c, idx) => {
              const res = safetyResults.find(r => r.id === c.id)
              const passed = res?.pass
              return (
                <div
                  key={c.id || idx}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    background: 'var(--bg-input)',
                    border: `1px solid ${passed ? 'var(--border)' : 'rgba(239, 68, 68, 0.4)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
                      {c.category} • Case #{c.id}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, color: passed ? '#10b981' : '#ef4444' }}>
                      {passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>"{c.prompt}"</div>
                  {c.expect && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expected: {c.expect.join(', ')}</div>}
                  {c.reject && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Must Reject: {c.reject.join(', ')}</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="palette-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="small-btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
export default EvalDashboard
