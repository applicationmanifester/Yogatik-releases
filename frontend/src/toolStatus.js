/**
 * Tool-status hub — a tiny in-memory pub/sub that tracks the live lifecycle of
 * every tool invocation (running → done | error) plus timing. Decoupled from
 * React so the agent loop can publish without importing the UI, and so it is
 * unit-testable without a DOM. Powers the ToolStatusPanel ("ready / loading /
 * failed" + retry) and the standardised, friendly error UI.
 *
 * Not persisted: this is ephemeral turn state, unlike errorLog.js (which keeps a
 * durable ring buffer for diagnostics). The two are complementary — begin()/fail()
 * here also forwards failures to logError so a screenshot still shows what broke.
 */
import { logError, diagnoseError } from './errorLog'
import { trackToolSettled } from './analytics'

const LONG_RUNNING_MS = 4000 // past this a tool is "slow", surfaced with a spinner

let _seq = 0
const _active = new Map() // id -> record
const _subs = new Set()

function snapshot() {
  return [..._active.values()].map(r => ({ ...r }))
}

function emit() {
  const list = snapshot()
  for (const fn of _subs) {
    try { fn(list) } catch { /* a bad subscriber must not break the hub */ }
  }
}

/** Subscribe to status changes. Returns an unsubscribe fn. Fires once immediately. */
export function subscribeToolStatus(fn) {
  _subs.add(fn)
  try { fn(snapshot()) } catch { /* ignore */ }
  return () => _subs.delete(fn)
}

/** Mark a tool invocation as started. Returns an opaque id used to settle it. */
export function beginTool(name, args) {
  const id = `${name}#${++_seq}`
  _active.set(id, {
    id,
    name: String(name || 'tool'),
    args: args || undefined,
    phase: 'running',
    startedAt: Date.now(),
    endedAt: null,
    error: null,
    diagnosis: null,
  })
  emit()
  return id
}

/**
 * Settle an invocation from its result object. A tool result is a failure when it
 * is falsy or `{success:false}` or carries an `error` — matching ToolResultCard's
 * own convention so the panel and the card never disagree.
 */
export function settleTool(id, result) {
  const rec = _active.get(id)
  if (!rec) return
  const failed = !result || result.success === false || !!result.error
  rec.phase = failed ? 'error' : 'done'
  rec.endedAt = Date.now()
  if (failed) {
    const message = result?.error || 'Unknown error'
    rec.error = String(message)
    rec.diagnosis = diagnoseError(message)
    logError('tool', `${rec.name}: ${rec.error}`, null, { tool: rec.name })
  }
  // Opt-in analytics only — a hard no-op unless the user enabled it.
  trackToolSettled(rec.name, !failed, rec.endedAt - rec.startedAt, failed ? rec.diagnosis?.type : undefined)
  emit()
  // Successful and errored records linger briefly so the UI can animate them out;
  // the panel filters what it shows. Auto-prune keeps the map from growing.
  const ttl = failed ? 8000 : 1200
  setTimeout(() => { if (_active.get(id) === rec) { _active.delete(id); emit() } }, ttl)
}

/** True once a running tool has crossed the "slow" threshold (for spinners/toasts). */
export function isLongRunning(rec, now = Date.now()) {
  return rec?.phase === 'running' && (now - rec.startedAt) >= LONG_RUNNING_MS
}

/** Human-friendly one-liner for a settled/failed record (reuses diagnoseError). */
export function friendlyError(rec) {
  const d = rec?.diagnosis || (rec?.error ? diagnoseError(rec.error) : null)
  if (!d) return 'The tool ran into a problem.'
  return d.suggestion || d.title || 'The tool ran into a problem.'
}

/** Test/reset helper — clears all state and subscribers. */
export function _resetToolStatus() {
  _active.clear()
  _subs.clear()
  _seq = 0
}

export { LONG_RUNNING_MS }
