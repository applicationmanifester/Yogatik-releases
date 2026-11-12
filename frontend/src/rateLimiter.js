/**
 * Per-provider token-bucket rate limiter + circuit breaker.
 *
 * Token bucket: refills at `ratePerMinute` tokens/min, bursts up to `burst`.
 * Each LLM call must `acquireProviderSlot(providerId)` before sending — if the
 * bucket is empty the promise resolves once a token is available (fair queue),
 * or rejects if the circuit breaker is open and cooldown hasn't elapsed.
 *
 * Circuit breaker: after `failureThreshold` consecutive failures for a
 * provider, the circuit opens for `cooldownMs` — all acquires reject fast
 * instead of burning retries against a dead upstream.
 */

const DEFAULT_RATE_PER_MIN = 10   // 10 requests/minute per provider
const DEFAULT_BURST = 3            // small burst allowance
const FAILURE_THRESHOLD = 5        // open circuit after 5 consecutive failures
const COOLDOWN_MS = 60_000         // 60s cooldown before half-open probe

// Per-provider state
const _buckets = new Map()  // providerId -> { tokens, lastRefill, ratePerMin, burst }
const _circuits = new Map() // providerId -> { failures, openedAt, state: 'closed'|'open'|'half-open' }
const _queues = new Map()   // providerId -> Array of { resolve, reject }

function now() { return Date.now() }

function getBucket(providerId) {
  let b = _buckets.get(providerId)
  if (!b) {
    b = {
      tokens: DEFAULT_BURST,
      lastRefill: now(),
      ratePerMin: DEFAULT_RATE_PER_MIN,
      burst: DEFAULT_BURST,
    }
    _buckets.set(providerId, b)
  }
  return b
}

function getCircuit(providerId) {
  let c = _circuits.get(providerId)
  if (!c) {
    c = { failures: 0, openedAt: 0, state: 'closed' }
    _circuits.set(providerId, c)
  }
  return c
}

function refill(b) {
  const elapsed = now() - b.lastRefill
  const refillAmount = (elapsed / 60_000) * b.ratePerMin
  b.tokens = Math.min(b.burst, b.tokens + refillAmount)
  b.lastRefill = now()
}

function recordSuccess(providerId) {
  const c = getCircuit(providerId)
  c.failures = 0
  c.state = 'closed'
  c.openedAt = 0
}

function recordFailure(providerId) {
  const c = getCircuit(providerId)
  c.failures++
  if (c.failures >= FAILURE_THRESHOLD && c.state !== 'open') {
    c.state = 'open'
    c.openedAt = now()
  }
}

function canAcquire(b, c) {
  if (c.state === 'open') {
    if (now() - c.openedAt >= COOLDOWN_MS) {
      c.state = 'half-open'
    } else {
      return false
    }
  }
  return b.tokens >= 1
}

function drainQueue(providerId) {
  const q = _queues.get(providerId)
  if (!q || q.length === 0) return
  const b = getBucket(providerId)
  const c = getCircuit(providerId)
  while (q.length > 0 && canAcquire(b, c)) {
    const { resolve } = q.shift()
    b.tokens -= 1
    resolve()
  }
}

/**
 * Acquire a token for `providerId` before making an LLM call.
 * Resolves when a token is available (may wait for refill).
 * Rejects if the circuit breaker is open and cooldown hasn't elapsed.
 *
 * Callers MUST call `releaseProviderSlot(providerId, success)` when the call
 * completes so failures trip the circuit breaker.
 */
export async function acquireProviderSlot(providerId, { wait = false } = {}) {
  const b = getBucket(providerId)
  const c = getCircuit(providerId)

  if (c.state === 'open') {
    if (now() - c.openedAt >= COOLDOWN_MS) {
      c.state = 'half-open'
    } else {
      throw new Error(`Circuit breaker is open for provider ${providerId} (cooldown in effect).`)
    }
  }

  refill(b)
  if (b.tokens >= 1) {
    b.tokens -= 1
    return
  }

  if (!wait) {
    throw new Error(`Rate limit exceeded for provider ${providerId}; bucket empty.`)
  }

  // Bucket empty and waiting requested — queue up and wait for refill
  return new Promise((resolve, reject) => {
    const q = _queues.get(providerId) || []
    _queues.set(providerId, q)
    q.push({ resolve, reject })
  })
}

/**
 * Release a slot after a call completes.
 * @param {boolean} success — true if the call succeeded, false if it failed
 */
export function releaseProviderSlot(providerId, success = true) {
  if (success) {
    recordSuccess(providerId)
    // Return the acquired token to the bucket (up to burst)
    const b = getBucket(providerId)
    b.tokens = Math.min(b.burst, b.tokens + 1)
    b.lastRefill = now()
  } else {
    recordFailure(providerId)
    refill(getBucket(providerId))
  }
  refill(getBucket(providerId))
  drainQueue(providerId)
}

/**
 * Return current limiter state for diagnostics / UI.
 */
export function getLimiterState(providerId) {
  const b = getBucket(providerId)
  const c = getCircuit(providerId)
  refill(b)
  return {
    providerId,
    tokens: Math.floor(b.tokens),
    burst: b.burst,
    ratePerMin: b.ratePerMin,
    circuitState: c.state,
    failures: c.failures,
    cooldownRemainingMs: c.state === 'open'
      ? Math.max(0, COOLDOWN_MS - (now() - c.openedAt))
      : 0,
    queued: (_queues.get(providerId) || []).length,
  }
}

/**
 * Configure a provider's limits (called from settings UI).
 */
export function configureProvider(providerId, { ratePerMin, burst } = {}) {
  const b = getBucket(providerId)
  if (ratePerMin != null) b.ratePerMin = ratePerMin
  if (burst != null) b.burst = burst
}

/**
 * Reset circuit breaker for a provider (admin / user action).
 */
export function resetCircuit(providerId) {
  const c = getCircuit(providerId)
  c.failures = 0
  c.state = 'closed'
  c.openedAt = 0
  drainQueue(providerId)
}
export { getBucket, getCircuit }
export default { acquireProviderSlot, releaseProviderSlot, getLimiterState, configureProvider, resetCircuit }
