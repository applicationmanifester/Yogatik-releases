import { describe, it, expect, vi } from 'vitest'
import { calculateBackoffWithJitter, isTransientError, executeWithRetry } from './resilientTransport'

describe('ResilientTransport', () => {
  it('calculates exponential backoff with jitter bounded by maxDelay', () => {
    const delay0 = calculateBackoffWithJitter(0, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delay0).toBe(1000)

    const delay3 = calculateBackoffWithJitter(3, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delay3).toBe(8000)

    const delayCapped = calculateBackoffWithJitter(10, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delayCapped).toBe(10000)
  })

  it('correctly classifies transient errors (429, 502, 503, 504, network drop, timeout)', () => {
    expect(isTransientError({ status: 429 })).toBe(true)
    expect(isTransientError({ status: 503 })).toBe(true)
    expect(isTransientError(new Error('fetch failed'))).toBe(true)
    expect(isTransientError(new Error('ECONNRESET'))).toBe(true)
    expect(isTransientError(new Error('Stream stalled — no tokens received'))).toBe(true)
    expect(isTransientError({ status: 401 })).toBe(false)
    expect(isTransientError({ name: 'AbortError' })).toBe(false)
  })

  it('retries transient failures until success and reports status to onRetry hook', async () => {
    let attempts = 0
    const onRetry = vi.fn()
    const operation = async () => {
      attempts++
      if (attempts < 3) {
        const err = new Error('503 Service Unavailable')
        err.status = 503
        throw err
      }
      return 'success'
    }

    const result = await executeWithRetry(operation, {
      maxRetries: 5,
      baseDelay: 10,
      maxDelay: 50,
      onRetry,
    })

    expect(result).toBe('success')
    expect(attempts).toBe(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('immediately respects AbortController signal without retrying', async () => {
    const controller = new AbortController()
    controller.abort()

    const operation = vi.fn().mockRejectedValue(new Error('Network drop'))
    await expect(executeWithRetry(operation, { signal: controller.signal, baseDelay: 10 })).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
  })
})
