import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  subscribeActivity, startActivityTurn, publishStream, publishStep,
  endActivityTurn, getActivity, _flushActivity, _resetActivity,
} from './activityStream'

beforeEach(() => _resetActivity())

describe('activityStream', () => {
  it('splits reasoning out of the streamed text', () => {
    startActivityTurn()
    publishStream('<think>weigh options</think>The answer is 4.')
    const a = getActivity()
    expect(a.reasoning).toBe('weigh options')
    expect(a.answer).toBe('The answer is 4.')
  })

  it('exposes an unclosed think block while it is still streaming', () => {
    startActivityTurn()
    publishStream('<think>still going')
    expect(getActivity().reasoning).toBe('still going')
    expect(getActivity().answer).toBe('')
  })

  it('adds steps and updates them in place by id', () => {
    startActivityTurn()
    publishStep({ id: '1', name: 'fs_read', status: 'running' })
    publishStep({ id: '1', status: 'done', ms: 42 })
    const { steps } = getActivity()
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ id: '1', name: 'fs_read', status: 'done', ms: 42 })
  })

  it('coalesces notifications — the panel must not re-render per token', () => {
    const cb = vi.fn()
    subscribeActivity(cb)          // immediate priming call
    expect(cb).toHaveBeenCalledTimes(1)
    startActivityTurn()
    publishStream('a')
    publishStream('ab')
    _flushActivity()
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const cb = vi.fn()
    const off = subscribeActivity(cb)
    off()
    startActivityTurn()
    _flushActivity()
    expect(cb).toHaveBeenCalledTimes(1)  // only the priming call
  })

  it('a new turn clears the previous one but keeps subscribers', () => {
    const cb = vi.fn()
    subscribeActivity(cb)
    startActivityTurn()
    publishStep({ id: '1', name: 'x', status: 'done' })
    publishStream('old')
    startActivityTurn()
    _flushActivity()
    const a = getActivity()
    expect(a.steps).toEqual([])
    expect(a.answer).toBe('')
    expect(a.turn).toBe(2)
    expect(cb.mock.calls.length).toBeGreaterThan(1)
  })

  it('survives a subscriber that throws', () => {
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    subscribeActivity(bad)
    subscribeActivity(good)
    startActivityTurn()
    _flushActivity()
    expect(good.mock.calls.length).toBeGreaterThan(1)
  })

  it('marks the turn finished', () => {
    startActivityTurn()
    expect(getActivity().running).toBe(true)
    endActivityTurn()
    expect(getActivity().running).toBe(false)
  })
})
