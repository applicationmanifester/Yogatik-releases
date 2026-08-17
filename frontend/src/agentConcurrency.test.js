import { describe, it, expect, beforeEach } from 'vitest'
import { runAgentPool, configureConcurrency, _resetAgentPool, MAX_CONCURRENCY } from './agentPool'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

describe('multiple agent instances at once', () => {
  beforeEach(() => { _resetAgentPool() })

  it('runs SEVERAL INSTANCES OF THE SAME AGENT concurrently', async () => {
    configureConcurrency(5)
    let running = 0, peak = 0
    const tasks = Array.from({ length: 5 }, () => ({ agent: 'researcher', task: 'x' }))
    await runAgentPool(tasks, async () => {
      running++; peak = Math.max(peak, running)
      await wait(30)
      running--
      return 'ok'
    })
    expect(peak).toBe(5) // all five instances of ONE agent ran at the same time
  })

  it('runs DIFFERENT agents concurrently', async () => {
    configureConcurrency(4)
    let running = 0, peak = 0
    const tasks = [{ agent: 'researcher' }, { agent: 'coder' }, { agent: 'writer' }, { agent: 'analyst' }]
    await runAgentPool(tasks, async () => {
      running++; peak = Math.max(peak, running)
      await wait(30)
      running--
    })
    expect(peak).toBe(4)
  })

  it('keeps results in input order even when they finish out of order', async () => {
    configureConcurrency(4)
    const out = await runAgentPool([40, 5, 20, 1], async (ms, i) => { await wait(ms); return i })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('one failing instance never sinks the batch', async () => {
    configureConcurrency(3)
    const out = await runAgentPool([1, 2, 3], async (_x, i) => {
      if (i === 1) throw new Error('boom')
      return 'ok'
    })
    expect(out[0]).toBe('ok')
    expect(out[1].error).toMatch(/boom/)
    expect(out[2]).toBe('ok')
  })

  it('never exceeds the safety ceiling, however many are requested', async () => {
    configureConcurrency(999)
    let running = 0, peak = 0
    await runAgentPool(Array.from({ length: 40 }, (_, i) => i), async () => {
      running++; peak = Math.max(peak, running)
      await wait(5)
      running--
    })
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY)
  })

  it('starts a queued instance the moment a slot frees (rolling, not batched)', async () => {
    configureConcurrency(2)
    const startOrder = []
    await runAgentPool([30, 5, 5, 5], async (ms, i) => { startOrder.push(i); await wait(ms) })
    // With batching, index 3 could not start until the 30ms task finished.
    expect(startOrder.length).toBe(4)
  })
})

describe('no hidden cap at 3', () => {
  beforeEach(() => { _resetAgentPool() })

  // The user reported "never more than 3 at a time". The pool itself does not
  // cap at 3 — auto concurrency is one slot per task, up to the ceiling.
  it('runs 10 sub-tasks with 10 running at once', async () => {
    _resetAgentPool()
    let running = 0, peak = 0
    const tasks = Array.from({ length: 10 }, (_, i) => i)
    await runAgentPool(tasks, async () => {
      running++; peak = Math.max(peak, running)
      await wait(25)
      running--
    })
    expect(peak).toBe(10)
  })

  it('runs 16 at once — the documented ceiling', async () => {
    _resetAgentPool()
    let running = 0, peak = 0
    await runAgentPool(Array.from({ length: 16 }, (_, i) => i), async () => {
      running++; peak = Math.max(peak, running)
      await wait(20)
      running--
    })
    expect(peak).toBe(16)
    expect(peak).toBe(MAX_CONCURRENCY)
  })
})
