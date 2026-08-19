import { describe, it, expect, vi } from 'vitest'
import { createActionGate, runGuarded, MODES } from './gate'

const SEND = { tool: 'browser_control', action: 'click', label: 'Send message' }
const READ = { tool: 'fs_read', args: { path: 'a.txt' } }

describe('action gate', () => {
  it('ask-first checks even a harmless read', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    const gate = createActionGate({ mode: MODES.ASK, confirm })
    const d = await gate(READ)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(d.allowed).toBe(true)
  })

  it('autopilot lets reversible work through WITHOUT asking', async () => {
    const confirm = vi.fn()
    const gate = createActionGate({ mode: MODES.AUTO, confirm })
    const d = await gate(READ)
    expect(confirm).not.toHaveBeenCalled()
    expect(d.allowed).toBe(true)
    expect(d.auto).toBe(true)
  })

  it('autopilot STILL stops before something irreversible', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    const gate = createActionGate({ mode: MODES.AUTO, confirm })
    const d = await gate(SEND)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(d.asked).toBe(true)
    expect(d.allowed).toBe(true)
  })

  it('a refusal blocks the action', async () => {
    const gate = createActionGate({ mode: MODES.AUTO, confirm: async () => false })
    const d = await gate(SEND)
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/declined/i)
  })

  it('FAILS CLOSED when there is no way to ask', async () => {
    const gate = createActionGate({ mode: MODES.AUTO })   // no confirm handler
    const d = await gate(SEND)
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/nothing available to confirm/i)
  })

  it('a throwing prompt is a refusal, never an approval', async () => {
    const gate = createActionGate({
      mode: MODES.AUTO,
      confirm: async () => { throw new Error('closed') },
    })
    expect((await gate(SEND)).allowed).toBe(false)
  })

  it('refuses everything once stopped', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const confirm = vi.fn().mockResolvedValue(true)
    const gate = createActionGate({ mode: MODES.AUTO, confirm, signal: ctrl.signal })
    const d = await gate(READ)
    expect(d.allowed).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('mode can be switched mid-run', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    const gate = createActionGate({ mode: MODES.AUTO, confirm })
    await gate(READ)
    expect(confirm).not.toHaveBeenCalled()
    gate.setMode(MODES.ASK)
    await gate(READ)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(gate.getMode()).toBe(MODES.ASK)
  })

  it('reports every decision so the UI can show what it did and why', async () => {
    const seen = []
    const gate = createActionGate({
      mode: MODES.AUTO,
      confirm: async () => true,
      onDecision: (d) => seen.push(d),
    })
    await gate(READ)
    await gate(SEND)
    expect(seen).toHaveLength(2)
    expect(seen[0].risk).toBe('safe')
    expect(seen[1].risk).toBe('confirm')
  })
})

describe('runGuarded', () => {
  it('executes what is allowed and skips what is refused, continuing either way', async () => {
    const gate = createActionGate({
      mode: MODES.AUTO,
      confirm: async () => false,     // refuse the irreversible one
    })
    const execute = vi.fn(async (s) => `did ${s.tool}`)
    const out = await runGuarded({ steps: [READ, SEND, READ], gate, execute })

    expect(execute).toHaveBeenCalledTimes(2)          // the send was skipped
    expect(out[1].skipped).toBe(true)
    expect(out[2].output).toBe('did fs_read')          // and the run continued
  })

  it('a failing step is recorded, not thrown', async () => {
    const gate = createActionGate({ mode: MODES.AUTO, confirm: async () => true })
    const execute = async () => { throw new Error('boom') }
    const out = await runGuarded({ steps: [READ], gate, execute })
    expect(out[0].output.error).toBe('boom')
  })

  it('stops mid-plan when aborted', async () => {
    const ctrl = new AbortController()
    const gate = createActionGate({ mode: MODES.AUTO, confirm: async () => true })
    const execute = vi.fn(async () => { ctrl.abort(); return 'ok' })
    const out = await runGuarded({ steps: [READ, READ, READ], gate, execute, signal: ctrl.signal })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(1)
  })
})
