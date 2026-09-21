/**
 * Tool Status Hub - manages per-invocation lifecycle records for tool calls.
 * Provides publish/subscribe for UI components to react to tool state changes.
 */

import { trackToolSettled, latencyBucket } from './analytics.js';
import { diagnoseError, logError } from './errorLog.js';

// ==================== Types ====================
/** @typedef {'idle'|'running'|'done'|'error'} ToolPhase */
/** @typedef {{ id: string, name: string, args: any, startedAt: number, phase: ToolPhase, endedAt?: number, error?: string, diagnosis?: any }} ToolRecord */

const LONG_RUNNING_MS = 4000; // past this a tool is "slow", surfaced with a spinner
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RUNNING_MS = 2 * 60 * 1000; // 2 minutes — auto-expire stuck 'running' records

// ==================== State ====================
let _seq = 0;
const _active = new Map(); // id -> ToolRecord
const _subscribers = new Set(); // Set<(records: ToolRecord[]) => void>

// ==================== Helpers ====================

function emit() {
  const snapshot = [..._active.values()].map(cloneRecord);
  for (const fn of _subscribers) {
    try { fn(snapshot); } catch { /* ignore subscriber errors */ }
  }
}

function cloneRecord(rec) {
  // Shallow clone is sufficient for our flat record structure
  return { ...rec };
}

function generateId(toolName) {
  return `${toolName}#${++_seq}`;
}

// ==================== Public API ====================

/**
 * Begins tracking a new tool invocation.
 * @param {string} toolName - Name of the tool being invoked
 * @param {any} [args] - Arguments passed to the tool (preserved as-is, including falsy values)
 * @returns {string} The invocation ID
 */
export function beginTool(toolName, args) {
  const id = generateId(toolName);
  const rec = {
    id,
    name: String(toolName || 'tool'),
    args, // preserve args exactly as provided (including null/undefined/0/'')
    startedAt: Date.now(),
    phase: 'running',
  };
  _active.set(id, rec);
  emit();

  // Watchdog: if settleTool is never called (e.g. network drop / abort) the
  // record auto-expires after MAX_RUNNING_MS so the panel never stays stuck.
  setTimeout(() => {
    const current = _active.get(id);
    if (current && current.phase === 'running') {
      current.phase = 'error';
      current.error = 'Timed out — tool did not respond.';
      current.endedAt = Date.now();
      emit();
      setTimeout(() => {
        if (_active.get(id) === current) { _active.delete(id); emit(); }
      }, 8000);
    }
  }, MAX_RUNNING_MS);

  return id;
}

/**
 * Settles a tool invocation as either done or failed.
 * @param {string} id - The invocation ID returned by beginTool
 * @param {{ error?: string|Error|null, success?: boolean, [key: string]: any }} result - Result object; if error is truthy or success===false, marks as failed
 */
export function settleTool(id, result) {
  const rec = _active.get(id);
  if (!rec) return; // no-op for unknown IDs

  const hasError = !result || result.success === false || !!result?.error;
  
  if (hasError) {
    const message = result?.error instanceof Error ? result.error.message : String(result?.error || 'Unknown error');
    rec.phase = 'error';
    rec.error = message;
    rec.diagnosis = diagnoseError(message);
    logError('tool', `${rec.name}: ${rec.error}`, null, { tool: rec.name });
  } else {
    rec.phase = 'done';
  }
  
  rec.endedAt = Date.now();
  emit();
  trackToolSettled(rec.name, hasError ? 'error' : 'success', rec.endedAt - rec.startedAt, hasError ? rec.diagnosis?.type : undefined);

  // Schedule cleanup after TTL (different TTL for failed vs success to allow UI animations)
  const ttl = hasError ? 8000 : 1200;
  setTimeout(() => {
    if (_active.get(id) === rec) {
      _active.delete(id);
      emit();
    }
  }, ttl);
}

/**
 * Subscribes to tool status updates.
 * Immediately receives a snapshot of current records, then called on every change.
 * @param {(records: ToolRecord[]) => void} fn - Callback receiving cloned record array
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToolStatus(fn) {
  _subscribers.add(fn);
  // Immediate snapshot (with error handling)
  try {
    fn([..._active.values()].map(cloneRecord));
  } catch {
    // ignore subscriber errors during initial call
  }
  return () => _subscribers.delete(fn);
}

/**
 * Returns a snapshot of all current tool records.
 * @returns {ToolRecord[]}
 */
export function snapshot() {
  return [..._active.values()].map(cloneRecord);
}

/**
 * Checks if a specific tool invocation has been running longer than the threshold.
 * @param {ToolRecord} rec - A record from snapshot() or subscribe callback
 * @param {number} [now=Date.now()] - Optional timestamp for testing
 * @returns {boolean}
 */
export function isLongRunning(rec, now = Date.now()) {
  return rec?.phase === 'running' && (now - rec.startedAt) >= LONG_RUNNING_MS;
}

/**
 * Returns a user-friendly error message for a record, if any.
 * @param {ToolRecord} rec
 * @returns {string|null}
 */
export function friendlyError(rec) {
  if (!rec || rec.phase !== 'error') return null;
  const d = rec.diagnosis || (rec?.error ? diagnoseError(rec.error) : null);
  if (!d) return 'The tool ran into a problem.';
  return d.suggestion || d.title || 'The tool ran into a problem.';
}

/**
 * Force-settles every currently 'running' record as an error.
 * Call this when the agent stream is aborted so the panel clears immediately
 * instead of waiting for the MAX_RUNNING_MS watchdog.
 * @param {string} [reason]
 */
export function forceSettleAll(reason = 'Cancelled.') {
  for (const [id, rec] of _active) {
    if (rec.phase !== 'running') continue;
    rec.phase = 'error';
    rec.error = reason;
    rec.endedAt = Date.now();
    // Short TTL — error badge fades out, not worth lingering.
    setTimeout(() => { if (_active.get(id) === rec) { _active.delete(id); emit(); } }, 4000);
  }
  emit();
}

/** Resets all internal state (for testing only). */
export function _resetToolStatus() {
  _active.clear();
  _subscribers.clear();
  _seq = 0;
}

export { LONG_RUNNING_MS };