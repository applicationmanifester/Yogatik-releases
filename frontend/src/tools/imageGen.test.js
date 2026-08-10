import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchImage } from './imageGen'

describe('fetchImage rate-gate + retry', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('retries on 429 then succeeds', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      return calls < 2
        ? { ok: false, status: 429, headers: { get: () => null } }
        : { ok: true, status: 200, headers: { get: () => null } }
    })
    const p = fetchImage('https://image.pollinations.ai/x', { retries: 3 })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('gives up after exhausting retries', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => null } }))
    const p = fetchImage('https://image.pollinations.ai/y', { retries: 1 })
    await vi.runAllTimersAsync()
    await expect(p).rejects.toThrow()
  })
})
