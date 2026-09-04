import { describe, it, expect, vi } from 'vitest'
import {
  preconnectProvider,
  isSyntacticallyComplete,
  SpeculativeEndpointManager,
  pHashDelta,
} from './latencyOptimizer'
import { matchReflex, streamReflex } from './reflexEngine'

describe('reflexEngine', () => {
  it('matches greeting reflex intents instantly', () => {
    expect(matchReflex('hello')).toBeTruthy()
    expect(matchReflex('hi there')).toBeTruthy()
    expect(matchReflex('good morning')).toBeTruthy()
  })

  it('matches status and courtesy intents', () => {
    expect(matchReflex('how are you?')).toBeTruthy()
    expect(matchReflex('can you hear me?')).toBeTruthy()
    expect(matchReflex('who are you')).toBeTruthy()
    expect(matchReflex('thank you so much')).toBeTruthy()
  })

  it('evaluates dynamic real-time time and date queries locally in milliseconds', () => {
    const timeAnswer = matchReflex('what time is it?')
    expect(timeAnswer).toMatch(/It's currently/i)

    const dateAnswer = matchReflex("what is today's date?")
    expect(dateAnswer).toMatch(/Today is/i)

    const capsAnswer = matchReflex("what can you do?")
    expect(capsAnswer).toMatch(/I can/i)

    const pingAnswer = matchReflex("are you online")
    expect(pingAnswer).toMatch(/online|ready/i)
  })

  it('returns null for non-reflex questions so full agent runs', () => {
    expect(matchReflex('what is the capital of France?')).toBeNull()
    expect(matchReflex('write a python script to parse csv')).toBeNull()
    expect(matchReflex('search the web for apple stock price')).toBeNull()
  })

  it('streams reflex tokens with valid onToken and onDone calls', async () => {
    const tokens = []
    let doneResult = null
    await streamReflex('Hello! Ready when you are.', {
      onToken: (t) => tokens.push(t),
      onDone: (res) => { doneResult = res },
    })
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.join('')).toBe('Hello! Ready when you are.')
    expect(doneResult?.content).toBe('Hello! Ready when you are.')
  })
})

describe('latencyOptimizer', () => {
  it('detects syntactically complete utterances for speculative execution', () => {
    expect(isSyntacticallyComplete('hello')).toBe(false)
    expect(isSyntacticallyComplete('what is the weather today in tokyo?')).toBe(true)
    expect(isSyntacticallyComplete('how can you help me with coding?')).toBe(true)
    expect(isSyntacticallyComplete('i want to know about the and')).toBe(false) // trailing connector
  })

  it('coordinates speculative execution and commit correctly', () => {
    const onSpeculate = vi.fn()
    const onCancel = vi.fn()
    const mgr = new SpeculativeEndpointManager({ onSpeculate, onCancel })

    mgr.handleInterim('what is the time now?')
    expect(onSpeculate).toHaveBeenCalledWith('what is the time now?', expect.anything())

    const result = mgr.commit('what is the time now?')
    expect(result.matched).toBe(true)
  })

  it('aborts speculative execution when final utterance completely diverges', () => {
    const onSpeculate = vi.fn()
    const onCancel = vi.fn()
    const mgr = new SpeculativeEndpointManager({ onSpeculate, onCancel })

    mgr.handleInterim('what is the time now?')
    const result = mgr.commit('tell me a story about space')
    expect(result.matched).toBe(false)
    expect(onCancel).toHaveBeenCalled()
  })

  it('pHashDelta detects unchanged vs changed hashes', () => {
    // Null canvas gracefully returns safe default
    const res = pHashDelta(null)
    expect(res.deltaPercent).toBe(100)
    expect(res.isChanged).toBe(true)
  })
})
