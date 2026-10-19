/**
 * Quality-eval runner card — the user-facing half of the "turn on measurement"
 * work. The evalHarness graded GOLDEN_SET silently on every Diagnostics open;
 * this card makes the measurement explicit: run the golden + red-team set, see
 * pass rates per category, the exact failing cases (expected vs received), how
 * long the run took, and a persisted history of the last runs.
 *
 * Two modes:
 *  - "safety" (always available, default): grades only the on-device
 *    safety screen (assessSafety) — pure, deterministic, ZERO network. This
 *    is the no-model baseline: it works with no API key, offline, instantly.
 *  - "full" (only when a caller supplies `respond` — an async
 *    `(prompt) => string` turn fn): feeds every case through that responder
 *    (the app's real message-send machinery or a stub) and grades the replies
 *    with runEval, including the abort-able response capture.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { FlaskConical, Play, Square, History } from 'lucide-react'
import { GOLDEN_SET, runEval, runSafetyScreenEval } from '../evalHarness'
import { assessSafety } from '../safety'
import { getSetting, setSetting } from '../db'

// The card's own run records share the `eval_history` settings key with
// runAndRecordEval's safety+rag snapshots (evalHarness.js). Both keep their
// own cap — 10 card runs, 20 harness snapshots — and never evict each other.
const EVAL_HISTORY_KEY = 'eval_history'
const CARD_RUN_KIND = 'quality'
const MAX_CARD_RUNS = 10
// Mirrors MAX_EVAL_HISTORY in evalHarness.js for the other records.
const MAX_OTHER_RUNS = 20
const EXCERPT_LEN = 120

/** Pure: append one card-run record, keeping only the newest MAX_CARD_RUNS
 * quality-run entries and MAX_OTHER_RUNS harness records, chronological order
 * preserved. Exported for tests without a db. */
export function appendEvalRun(history, entry) {
  const next = Array.isArray(history) ? [...history, entry] : [entry]
  let card = 0
  let other = 0
  const kept = []
  for (let i = next.length - 1; i >= 0; i--) {
    const e = next[i]
    const isCard = !!e && e.kind === CARD_RUN_KIND
    if (isCard ? card++ < MAX_CARD_RUNS : other++ < MAX_OTHER_RUNS) kept.push(e)
  }
  return kept.reverse()
}

/** Pure: entries rendered by this card (its own run summaries), oldest first. */
export function pickQualityRuns(history) {
  return (Array.isArray(history) ? history : []).filter(e =>
    e && typeof e === 'object' && Number.isFinite(e.total) &&
    e.byCategory && typeof e.byCategory === 'object')
}

/** Pure: the persisted summary record for one finished run. */
export function buildRunEntry(summary, at = Date.now()) {
  return {
    at, kind: CARD_RUN_KIND, mode: summary.mode || 'safety',
    total: summary.total, passed: summary.passed,
    byCategory: summary.byCategory || {},
  }
}

function excerpt(s, n = EXCERPT_LEN) {
  const text = String(s ?? '')
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n)}…` : clean
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function pctBar(pct, width = 64) {
  const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ width, minWidth: width, height: 4, borderRadius: 2, background: 'var(--bg-input, rgba(0,0,0,0.3))', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  )
}

const pctColor = pct => pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'

/** What the safety screen SHOULD have decided for this case's category. */
function screenExpectation(evalCase) {
  if (evalCase?.category === 'crisis') return 'crisis screen should flag'
  if (evalCase?.category === 'boundary') return 'boundary screen should flag'
  return 'no crisis flag (no false positive)'
}

/** What the pure, offline classifier actually decided for this prompt. */
function screenGot(evalCase) {
  if (!evalCase) return '—'
  let v = {}
  try { v = assessSafety(evalCase.prompt) } catch { /* never blocks the run */ }
  return v.crisis ? 'crisis flag' : v.boundary ? 'boundary flag on' : 'no flag'
}

export function EvalRunsCard({ respond = null, cases = GOLDEN_SET, mode = 'auto' }) {
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [running, setRunning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  // Synchronous double-run guard: React state lags one event behind, so a fast
  // second click on "Run" would otherwise start a second run beside the first.
  const busyRef = useRef(false)
  // Full mode captures each prompt -> reply + per-case ms, so failing rows can
  // show the RECEIVED excerpt without changing runEval's contract.
  const capturedRef = useRef(new Map())
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; abortRef.current?.abort?.() }
  }, [])

  // Load the persisted run history (best-effort — offline / closed DB is fine).
  useEffect(() => {
    let on = true
    getSetting(EVAL_HISTORY_KEY, [])
      .then(h => { if (on) setHistory(pickQualityRuns(h)) })
      .catch(() => {})
    return () => { on = false }
  }, [])

  const hasModel = typeof respond === 'function'
  // mode="safety" always means the offline screen, even when a respond fn is
  // also supplied ("auto" is the default that lights up the model run).
  const effectiveMode = mode === 'safety' ? 'safety' : (hasModel ? 'full' : 'safety')
  const forcedFull = mode === 'full' && !hasModel

  const handleRun = async () => {
    if (busyRef.current) return
    busyRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    const captured = new Map()   // prompt -> { text, ms } — full mode only
    capturedRef.current = captured
    setRunning(true)
    setCancelled(false)
    setResult(null)
    setError(null)
    const t0 = Date.now()
    try {
      let summary
      if (effectiveMode === 'full') {
        const wrapped = async (prompt) => {
          if (controller.signal.aborted) throw new Error('Run cancelled')
          const s = Date.now()
          let text
          try { text = await respond(prompt) } catch (e) { text = `__ERROR__ ${e?.message || e}` }
          captured.set(prompt, { text, ms: Date.now() - s })
          if (controller.signal.aborted) throw new Error('Run cancelled')
          return text
        }
        const res = await runEval(wrapped, cases)
        if (controller.signal.aborted) return      // discard — the run was stopped
        summary = { ...res, mode: 'full' }
      } else {
        const res = runSafetyScreenEval(cases)
        if (controller.signal.aborted) return
        summary = { ...res, mode: 'safety' }
      }
      summary.durationMs = Date.now() - t0
      setResult(summary)
      // Persist into the shared eval_history settings key (cap: last 10 runs).
      try {
        const prev = await getSetting(EVAL_HISTORY_KEY, [])
        const next = appendEvalRun(prev, buildRunEntry(summary))
        await setSetting(EVAL_HISTORY_KEY, next)
        if (aliveRef.current && !controller.signal.aborted) setHistory(pickQualityRuns(next))
      } catch { /* history is a nicety, never a blocker */ }
    } catch (e) {
      if (aliveRef.current && !controller.signal.aborted) setError(e?.message || String(e))
    } finally {
      if (abortRef.current === controller) {
        if (aliveRef.current) setRunning(false)
        abortRef.current = null
      }
      busyRef.current = false
    }
  }

  const handleAbort = () => {
    const c = abortRef.current
    if (!c) return
    c.abort()
    abortRef.current = null
    busyRef.current = false
    setRunning(false)
    setCancelled(true)
  }

  // Failure rows: expected = the failed graders / what the screen should have
  // decided; received = reply excerpt (full) or classifier verdict (safety).
  const failureRows = useMemo(() => {
    if (!result) return []
    const caseById = new Map((cases || []).map(c => [c.id, c]))
    return (result.failures || []).map(f => {
      const c = caseById.get(f.id)
      const isFull = result.mode === 'full'
      const got = isFull && c ? capturedRef.current.get(c.prompt) : null
      const failedChecks = (f.checks || []).filter(ch => !ch.ok).map(ch => ch.name)
      return {
        id: f.id,
        category: c?.category || f.category || 'safety',
        expected: failedChecks.length ? failedChecks.join(', ') : screenExpectation(c),
        received: isFull
          ? excerpt(got ? got.text : (f.received ?? '(no reply captured)'))
          : screenGot(c),
        ms: got ? got.ms : undefined,
      }
    })
  }, [result, cases])

  const categoryRate = (result && result.byCategory) ? Object.entries(result.byCategory).map(([cat, s]) => ({
    cat, passed: s.passed, total: s.total, pct: s.total ? Math.round((s.passed / s.total) * 100) : 0,
  })) : []

  return (
    <div
      style={{
        background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
        border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8
      }}
    >
      {/* Header: identity, mode chip, run / stop buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <FlaskConical size={13} style={{ color: 'var(--accent)' }} />
        <strong style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>Quality evals</strong>
        <span
          title={effectiveMode === 'full'
            ? 'Runs every golden case through the live responder, then grades the replies'
            : 'Grades only the on-device safety classifier — no model call, no network'}
          style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4, color: 'var(--text-secondary)',
            background: effectiveMode === 'full' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.12)'
          }}
        >
          {effectiveMode === 'full' ? 'full model run' : 'on-device · no model'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {cases.length} cases
        </span>

        {running ? (
          <button
            type="button"
            className="error-btn-secondary"
            onClick={handleAbort}
            title="Stop this eval run"
            aria-label="Stop eval run"
            style={{ padding: '4px 10px', fontSize: 11, color: '#ef4444' }}
          >
            <Square size={11} /> <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="error-btn-secondary"
            onClick={handleRun}
            title="Run the golden + red-team eval set"
            style={{ padding: '4px 10px', fontSize: 11 }}
          >
            <Play size={11} /> <span>Run quality evals</span>
          </button>
        )}
      </div>

      {forcedFull && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          no responder wired in — falling back to the offline safety screen
        </div>
      )}

      {/* Run result */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
            <strong style={{ color: pctColor((result.passRate || 0) * 100) }}>
              {result.passed}/{result.total} passed
            </strong>
            <span>· {result.mode === 'full' ? 'model run' : 'safety screen'} took {Math.round(result.durationMs || 0)}ms</span>
          </div>

          {/* Pass rate per category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categoryRate.map(r => (
              <div key={r.cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                <span data-testid={`cat-${r.cat}`} style={{ minWidth: 64 }}>{r.cat}</span>
                {pctBar(r.pct)}
                <span>
                  <strong style={{ color: r.pct === 100 ? '#10b981' : '#f59e0b' }}>{r.passed}/{r.total}</strong>
                  <span style={{ color: 'var(--text-muted)' }}> · {r.pct}%</span>
                </span>
              </div>
            ))}
          </div>

          {/* Failing cases: expected vs received */}
          {failureRows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {failureRows.map(f => (
                <div
                  key={f.id}
                  style={{
                    fontSize: 11, lineHeight: 1.45, borderRadius: 6, padding: '6px 8px',
                    background: 'var(--bg-input, rgba(0,0,0,0.25))',
                    border: '1px solid rgba(239,68,68,0.25)'
                  }}
                >
                  <div style={{ color: '#ef4444' }}>
                    ✕ <strong>{f.id}</strong> <span style={{ color: 'var(--text-muted)' }}>({f.category})</span>
                    {f.ms != null && <span style={{ color: 'var(--text-muted)' }}> · {f.ms}ms</span>}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>expected: {f.expected}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>received: <span style={{ fontStyle: 'italic' }}>{f.received}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cancelled && (
        <div style={{ fontSize: 11, color: '#f59e0b' }}>
          Run cancelled — nothing recorded.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444' }}>
          Eval run failed: {error}
        </div>
      )}

      {/* Persisted history — last runs, newest first, mini-bar per run */}
      <div style={{ borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))', paddingTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
          <History size={11} /> Recent runs
          <span style={{ marginLeft: 'auto' }}>last 10, kept on-device</span>
        </div>
        {history.length === 0 ? (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            no recorded runs yet — run once to start the history
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {history.map((h, i) => {
              const pct = h.total ? Math.round((h.passed / h.total) * 100) : 0
              return (
                <div key={h.at || i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                  <span style={{ minWidth: 38, color: 'var(--text-muted)' }}>{formatTime(h.at)}</span>
                  <span style={{
                    fontSize: 9, padding: '0 5px', borderRadius: 3,
                    background: h.mode === 'full' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.12)'
                  }}>
                    {h.mode === 'full' ? 'model' : 'safety'}
                  </span>
                  {pctBar(pct, 40)}
                  <span><strong style={{ color: pct === 100 ? '#10b981' : '#f59e0b' }}>{h.passed}/{h.total}</strong></span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
