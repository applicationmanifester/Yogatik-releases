/**
 * runWorkflowCore.test.js — the shared seam between the manual Run button and
 * the proactive scheduler's ticker. Pure parts only: the prompt runner's
 * settle-poll interval is clock-faked with vi.useFakeTimers; the executor test
 * uses a stub runner (the agent itself is App's live send machinery, which a
 * unit test must never touch).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { executeWorkflowAgainstAgent, createAgentPromptRunner, SETTLE_TIMEOUT_MS } from './runWorkflowCore'

afterEach(() => { vi.useRealTimers() })

describe('executeWorkflowAgainstAgent', () => {
  it('chains {{last}} through the injected prompt runner like a manual run', async () => {
    const prompts = []
    const out = await executeWorkflowAgainstAgent(
      { name: 't', steps: [{ prompt: 'Find {{topic}}' }, { prompt: 'Now summarise {{last}}' }] },
      { topic: 'owls' },
      async (p) => { prompts.push(p); return `out ${prompts.length}` },
    )
    expect(prompts).toEqual(['Find owls', 'Now summarise out 1'])
    expect(out[1].output).toBe('out 2')
  })

  it('falls back to empty values without throwing', async () => {
    const results = await executeWorkflowAgainstAgent({ name: 't', steps: [{ prompt: 'go' }] }, {}, async (p) => p)
    expect(results).toEqual([{ prompt: 'go', output: 'go' }])
  })
})

describe('createAgentPromptRunner (clock-faked settle probe)', () => {
  it('sends the prompt and resolves only once the turn stops being busy', async () => {
    vi.useFakeTimers()
    const seen = []
    let busy = true
    const runner = createAgentPromptRunner({ send: (p) => seen.push(p), isBusy: () => busy })
    const pending = runner('step one')
    expect(seen).toEqual(['step one'])
    // Inside the 900ms min-wait window nothing settles, busy or not.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await Promise.race([pending, 'still-running'])).toBe('still-running')
    // Then the turn finishes → the next poll (>900ms elapsed and !busy) resolves.
    busy = false
    await vi.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toBe('')
  })

  it('gives up after the full timeout rather than waiting forever', async () => {
    vi.useFakeTimers()
    let sent = false
    const runner = createAgentPromptRunner({ send: () => { sent = true }, isBusy: () => true })
    const pending = runner('step two')
    expect(sent).toBe(true)
    await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS + SETTLE_TIMEOUT_MS)
    await expect(pending).resolves.toBe('')
  })

  it('a runner with nowhere to send resolves immediately (no zombie polling)', async () => {
    const runner = createAgentPromptRunner({})
    await expect(runner('orphan')).resolves.toBe('')
  })
})
