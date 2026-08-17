/**
 * Privacy-first, opt-in analytics. OFF by default and a hard no-op until the
 * user explicitly enables it — nothing is buffered, sent, or stored otherwise,
 * preserving the app's privacy-first positioning.
 *
 * Design goals:
 *  - Anonymised: only event name + coarse, non-PII props (tool name, ok/fail,
 *    bucketed latency). Never message content, URLs, keys, or user text.
 *  - Sink-agnostic: enable(sink) accepts any {capture(event, props)} object
 *    (PostHog, a self-hosted collector, or a test spy). No SDK is bundled here.
 *  - Fail-open silence: a broken sink never throws into the app.
 */

let _enabled = false
let _sink = null

/** Enable analytics with a sink (e.g. PostHog). Idempotent. */
export function enableAnalytics(sink) {
  if (!sink || typeof sink.capture !== 'function') return false
  _sink = sink
  _enabled = true
  return true
}

/** Disable and forget the sink. */
export function disableAnalytics() {
  _enabled = false
  _sink = null
}

export function isAnalyticsEnabled() { return _enabled }

/** Bucket a latency (ms) into coarse, non-identifying ranges. */
export function latencyBucket(ms) {
  if (ms == null || ms < 0) return 'unknown'
  if (ms < 250) return '<250ms'
  if (ms < 1000) return '250ms-1s'
  if (ms < 4000) return '1-4s'
  if (ms < 10000) return '4-10s'
  return '>10s'
}

// Allowlist of prop keys that are safe to send — anything else is dropped, so a
// careless caller can never leak content through analytics.
const SAFE_KEYS = new Set(['tool', 'ok', 'errorType', 'latencyBucket', 'provider', 'feature', 'count'])

function sanitizeProps(props) {
  const out = {}
  for (const [k, v] of Object.entries(props || {})) {
    if (!SAFE_KEYS.has(k)) continue
    if (typeof v === 'string') out[k] = v.slice(0, 64)
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

/** Record an event. No-op unless enabled. Never throws. */
export function track(event, props = {}) {
  if (!_enabled || !_sink) return
  try { _sink.capture(String(event).slice(0, 64), sanitizeProps(props)) } catch { /* silence */ }
}

/** Convenience for the tool lifecycle (called from toolStatus). */
export function trackToolSettled(name, ok, ms, errorType) {
  track('tool_settled', { tool: name, ok, latencyBucket: latencyBucket(ms), ...(errorType ? { errorType } : {}) })
}
