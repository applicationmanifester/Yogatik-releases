/**
 * Rate Limiting Middleware (Sliding Window Algorithm)
 *
 * Prevents quota exhaustion on academic APIs and long-running tools.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  limit: number
}

class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map()

  /**
   * Checks if a user has exceeded their quota for a given tool/action
   */
  checkLimit(key: string, maxRequests: number = 30, windowMs: number = 60000): RateLimitResult {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []
    const validTimestamps = timestamps.filter((t) => now - t < windowMs)

    if (validTimestamps.length >= maxRequests) {
      const oldest = validTimestamps[0]
      const resetMs = Math.max(0, windowMs - (now - oldest))
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        limit: maxRequests,
      }
    }

    validTimestamps.push(now)
    this.requests.set(key, validTimestamps)

    return {
      allowed: true,
      remaining: maxRequests - validTimestamps.length,
      resetMs: windowMs,
      limit: maxRequests,
    }
  }

  resetKey(key: string): void {
    this.requests.delete(key)
  }
}

export const rateLimiter = new InMemoryRateLimiter()
