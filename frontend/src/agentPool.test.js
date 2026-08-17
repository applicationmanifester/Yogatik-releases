import { describe, it, expect, afterEach } from 'vitest'
import {
  configureConcurrency, withSlot, runAgentPool, activeCount, _resetAgentPool,
} from './agentPool'

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

afterEach(() => _resetAgentPool())

describe('agentPool concurrency semaphore', () => {
  it('clamps the configured limit to 1–16', () => {
    expect(configureConcurrency(100)).toBe(16)
    expect(configureConcurrency(0)).toBe(1)
    expect(configureConcurrency(-5)).toBe(1)
    expect(configureConcurrency(3)).toBe(3)
  })

  it('never runs more than the configured number of slots at once', async () => {
    configureConcurrency(2)
    let current = 0
    let peak = 0
    const work = () => withSlot(async () => {
      current++
      peak = Math.max(peak, current)
      await tick()
      current--
      return 'ok'
    })
    const out = await Promise.all(Array.from({ length: 8 }, work))
    expect(out).toHaveLength(8)
    expect(peak).toBe(2)
    expect(activeCount()).toBe(0) // all slots released
  })

  it('releases the slot even when the task throws', async () => {
    configureConcurrency(1)
    await withSlot(async () => { throw new Error('boom') }).catch(() => {})
    expect(activeCount()).toBe(0)
    // A following task can still acquire the freed slot.
    const r = await withSlot(async () => 'after')
    expect(r).toBe('after')
  })

  it('raising the limit lets queued waiters proceed', async () => {
    configureConcurrency(1)
    let peak = 0
    let current = 0
    const work = () => withSlot(async () => {
      current++; peak = Math.max(peak, current); await tick(20); current--
    })
    const p = Promise.all([work(), work(), work()])
    await tick(2)
    configureConcurrency(3) // widen mid-flight
    await p
    expect(peak).toBeGreaterThan(1)
  })
})

describe('runAgentPool', () => {
  it('preserves input order in the results', async () => {
    const res = await runAgentPool([1, 2, 3, 4], async (n) => { await tick(Math.random() * 5); return n * 10 })
    expect(res).toEqual([10, 20, 30, 40])
  })

  it('isolates a failing worker without sinking the batch', async () => {
    const res = await runAgentPool([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('boom')
      return n * 10
    })
    expect(res[0]).toBe(10)
    expect(res[1]).toEqual({ error: 'boom' })
    expect(res[2]).toBe(30)
  })

  it('returns [] for empty input', async () => {
    expect(await runAgentPool([], async () => 1)).toEqual([])
  })

  it('defaults to as many slots as the batch needs (no artificial cap)', async () => {
    // No max_parallel_agents pref set → auto = one slot per task.
    let current = 0
    let peak = 0
    await runAgentPool([1, 2, 3, 4, 5], async () => {
      current++; peak = Math.max(peak, current); await tick(); current--
    })
    expect(peak).toBe(5) // all five ran at once
  })
})
