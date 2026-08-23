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

describe('per-conversation scoping', () => {
  it('keeps each conversation’s reasoning and steps separate', () => {
    startActivityTurn('chat-a')
    publishStream('<think>thinking about A</think>answer A', 'chat-a')
    publishStep({ id: 'a1', name: 'web_search', status: 'running' }, 'chat-a')

    startActivityTurn('chat-b')
    publishStream('<think>thinking about B</think>answer B', 'chat-b')

    expect(getActivity('chat-a').reasoning).toBe('thinking about A')
    expect(getActivity('chat-a').steps).toHaveLength(1)
    expect(getActivity('chat-b').reasoning).toBe('thinking about B')
    expect(getActivity('chat-b').steps).toHaveLength(0)
  })

  it('a subscriber only sees the conversation it asked for', () => {
    const forA = vi.fn()
    subscribeActivity(forA, 'chat-a')
    startActivityTurn('chat-b')
    publishStream('<think>B only</think>', 'chat-b')
    _flushActivity()
    for (const [snap] of forA.mock.calls) expect(snap.reasoning).not.toBe('B only')
  })

  it('the key a turn publishes under is the key the panel subscribes to', () => {
    // The real bug was here and not in this module: App published under the
    // conversation's clientId while the panel subscribed with its database id,
    // so the panel was empty for every chat that had been saved. Same string in,
    // same data out — a mismatch anywhere upstream shows up as silence.
    const clientId = 'c_1712345_ab12'
    const seen = []
    subscribeActivity((snap) => seen.push(snap), clientId)

    startActivityTurn(clientId)
    publishStream('<think>live reasoning</think>the answer', clientId)
    publishStep({ id: `${clientId}:0`, name: 'web_search', status: 'running' }, clientId)
    _flushActivity()

    const latest = seen[seen.length - 1]
    expect(latest.reasoning).toBe('live reasoning')
    expect(latest.steps).toHaveLength(1)
    expect(latest.running).toBe(true)

    // …and a subscriber using a DIFFERENT key for the same chat sees nothing,
    // which is exactly how the failure presented.
    const wrong = vi.fn()
    subscribeActivity(wrong, 'db-id-42')
    _flushActivity()
    const last = wrong.mock.calls[wrong.mock.calls.length - 1][0]
    expect(last.reasoning).toBe('')
    expect(last.steps).toEqual([])
  })

  it('forgets the oldest chats instead of growing without limit', () => {
    for (let i = 0; i < 60; i++) {
      startActivityTurn(`chat-${i}`)
      publishStream(`<think>reasoning ${i}</think>`, `chat-${i}`)
      endActivityTurn(`chat-${i}`)
    }
    // The most recent conversations are still there…
    expect(getActivity('chat-59').reasoning).toBe('reasoning 59')
    // …and an old one has been dropped back to empty rather than kept forever.
    expect(getActivity('chat-0').reasoning).toBe('')
  })

  it('never evicts a conversation whose turn is still running', () => {
    startActivityTurn('long-runner')
    publishStream('<think>still working</think>', 'long-runner')
    for (let i = 0; i < 60; i++) {
      startActivityTurn(`filler-${i}`)
      endActivityTurn(`filler-${i}`)
    }
    // Dropping a live turn would blank the panel mid-answer.
    expect(getActivity('long-runner').reasoning).toBe('still working')
    expect(getActivity('long-runner').running).toBe(true)
  })

  it('ending a turn ends it on the named conversation, not the active one', () => {
    startActivityTurn('chat-a')
    startActivityTurn('chat-b')
    endActivityTurn('chat-a')
    expect(getActivity('chat-a').running).toBe(false)
    expect(getActivity('chat-b').running).toBe(true)
  })
})
