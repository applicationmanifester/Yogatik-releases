/**
 * Latency telemetry — the missing "can we see P50/P95" instrument from the audit.
 * Records time-to-first-token (TTFB) and total generation time per turn into a
 * capped in-memory ring, exposes percentiles for a Settings/observability view,
 * and forwards a coarse, non-PII event to the opt-in analytics hub.
 *
 * Pure maths + a small buffer — no network of its own, testable, privacy-safe.
 */
import { track, latencyBucket } from './analytics'

const MAX = 200
const _ttft = []   // ms to first token
const _total = []  // ms total generation

function push(arr, v) { arr.push(v); if (arr.length > MAX) arr.shift() }

/** Percentile (0–100) of a numeric sample using nearest-rank. */
export function percentile(samples, p) {
  if (!samples.length) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

/**
 * Start timing a turn. Returns a handle: call firstToken() when the first token
 * arrives and done() when generation completes. Safe to call either once.
 */
export function startTurn({ provider, model } = {}) {
  const t0 = now()
  let ttftMs = null
  let settled = false
  return {
    firstToken() {
      if (ttftMs != null) return
      ttftMs = now() - t0
      push(_ttft, ttftMs)
    },
    done() {
      if (settled) return
      settled = true
      const totalMs = now() - t0
      push(_total, totalMs)
      track('turn_latency', {
        provider,
        latencyBucket: latencyBucket(ttftMs ?? totalMs),
      })
      return { ttftMs, totalMs }
    },
  }
}

/** Snapshot for an observability panel. */
export function latencyReport() {
  return {
    samples: _total.length,
    ttft: { p50: percentile(_ttft, 50), p95: percentile(_ttft, 95) },
    total: { p50: percentile(_total, 50), p95: percentile(_total, 95) },
  }
}

/** Test/reset helper. */
export function _resetTelemetry() { _ttft.length = 0; _total.length = 0 }

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}
