/**
 * crewTrace.js — a tiny in-memory pub/sub ring buffer of crew_orchestrator
 * runs, so a user watching a multi-agent workflow can see WHICH specialists
 * ran, how long each took, and what the final call decided — the LangSmith-
 * style visibility gap crewRunner.js otherwise leaves: the workflows already
 * run in parallel under agentPool and already return per-specialist timing,
 * but nothing outside the tool result ever kept it.
 *
 * Same shape as toolStatus.js deliberately (subscribe/emit/reset), and for the
 * same reason: decoupled from React so recording never needs to import UI,
 * and unit-testable without a DOM. Unlike toolStatus.js this is NOT ephemeral
 * turn state — a finished crew run stays in the buffer (capped) so the trace
 * panel has something to show after the fact, not just while it's running.
 */

const MAX_TRACES = 25

let _seq = 0
const _traces = [] // newest first
const _subs = new Set()

function snapshot() { return _traces.map(t => ({ ...t })) }

function emit() {
  const list = snapshot()
  for (const fn of _subs) {
    try { fn(list) } catch { /* a bad subscriber must not break the hub */ }
  }
}

/** Subscribe to the trace list. Returns an unsubscribe fn. Fires once immediately. */
export function subscribeCrewTraces(fn) {
  _subs.add(fn)
  try { fn(snapshot()) } catch { /* ignore */ }
  return () => _subs.delete(fn)
}

/**
 * Normalise the per-specialist array out of a crew result — the five
 * workflows name it differently (specialist_reports / mapped_results /
 * candidates / results), and reflexion has no per-agent array at all (it is
 * one agent iterating against itself, recorded as history entries instead).
 */
function stepsFromResult(result) {
  const arr = result?.specialist_reports || result?.mapped_results || result?.candidates || result?.results
  if (Array.isArray(arr)) {
    return arr.map(r => ({
      agent: r.agentName || r.agent || 'unknown',
      role: r.role || null,
      durationMs: typeof r.durationMs === 'number' ? r.durationMs : null,
    }))
  }
  if (Array.isArray(result?.history)) {
    return result.history.map(h => ({ agent: h.type, role: null, durationMs: null }))
  }
  return []
}

/**
 * Record one finished (or failed) crew run. Called from ONE choke point —
 * crewOrchestratorTool.execute — rather than from each workflow function, the
 * same "wrap the single entry point" reasoning as installGate and db's
 * getSetting/setSetting choke points elsewhere in this app: it is the only
 * place that cannot be bypassed by a new workflow forgetting to call it.
 */
export function recordCrewRun({ workflow, goal, task, durationMs, result, error }) {
  const label = goal || task || null
  const entry = {
    id: `crew#${++_seq}`,
    workflow,
    goal: label ? String(label).slice(0, 200) : null,
    success: !error && result?.success !== false,
    error: error ? String(error) : (result?.success === false ? result.error : null),
    durationMs,
    steps: error ? [] : stepsFromResult(result),
    planSource: result?.plan_source || null,
    at: Date.now(),
  }
  _traces.unshift(entry)
  if (_traces.length > MAX_TRACES) _traces.length = MAX_TRACES
  emit()
  return entry.id
}

/** Test/reset helper — clears all state and subscribers. */
export function _resetCrewTraces() {
  _traces.length = 0
  _subs.clear()
  _seq = 0
}
