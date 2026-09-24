/**
 * Resilient Transport Layer
 * Handles exponential backoff with full jitter, transient error classification,
 * and reliable connection recovery for streaming & completion requests.
 */

/**
 * Calculates exponential backoff delay with random jitter.
 * @param {number} attempt - 0-indexed attempt count
 * @param {object} opts
 * @param {number} opts.baseDelay - Initial base delay in ms (default 1000)
 * @param {number} opts.maxDelay - Maximum ceiling delay in ms (default 15000)
 * @param {number} opts.jitterRatio - Fractional jitter ratio [0, 1] (default 0.2)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffWithJitter(attempt, { baseDelay = 1000, maxDelay = 15000, jitterRatio = 0.2 } = {}) {
  const exp = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))
  if (jitterRatio <= 0) return exp
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1)
  return Math.min(maxDelay, Math.max(baseDelay, Math.round(exp + jitter)))
}

/**
 * Determines if an error is transient (safe to retry with backoff).
 * @param {Error|object|string} err
 * @returns {boolean}
 */
export function isTransientError(err) {
  if (!err) return false
  if (err.name === 'AbortError') return false
  const status = Number(err.status || err.statusCode)
  if ([408, 429, 500, 502, 503, 504, 520, 522, 524].includes(status)) return true
  const msg = String(err.message || err).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('stream stalled') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('capacity spikes') ||
    msg.includes('cold-starts') ||
    msg.includes('service unavailable')
  )
}

/**
 * Executes an async operation with automatic retry on transient errors.
 * @param {Function} operation - (attempt: number) => Promise<any>
 * @param {object} options
 * @param {number} options.maxRetries - Maximum retry attempts before giving up
 * @param {number} options.baseDelay - Initial delay in ms
 * @param {number} options.maxDelay - Maximum delay cap in ms
 * @param {number} options.jitterRatio - Random jitter ratio
 * @param {AbortSignal} options.signal - AbortController signal
 * @param {Function} options.onRetry - ({ attempt, maxRetries, delay, error }) => void
 * @returns {Promise<any>}
 */
export async function executeWithRetry(operation, {
  maxRetries = 10,
  baseDelay = 1000,
  maxDelay = 15000,
  jitterRatio = 0.2,
  signal = null,
  onRetry = null,
} = {}) {
  let attempt = 0
  while (true) {
    if (signal?.aborted) {
      const abortErr = new Error('Operation aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    try {
      return await operation(attempt)
    } catch (err) {
      if (signal?.aborted || err.name === 'AbortError') throw err
      if (!isTransientError(err) || attempt >= maxRetries) {
        throw err
      }
      attempt++
      const delay = calculateBackoffWithJitter(attempt, { baseDelay, maxDelay, jitterRatio })
      onRetry?.({ attempt, maxRetries, delay, error: err })
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          const abortErr = new Error('Operation aborted')
          abortErr.name = 'AbortError'
          reject(abortErr)
        }, { once: true })
      })
    }
  }
}
