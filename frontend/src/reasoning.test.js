import { describe, it, expect } from 'vitest'
import { splitReasoning, visibleAnswer, createReasoningTagger } from './reasoning'

describe('splitReasoning', () => {
  it('separates a closed think block from the answer', () => {
    const { reasoning, answer } = splitReasoning('<think>weighing it up</think>The answer is 4.')
    expect(reasoning).toBe('weighing it up')
    expect(answer).toBe('The answer is 4.')
  })

  it('captures an UNCLOSED block, so reasoning is visible while it streams', () => {
    const { reasoning, answer } = splitReasoning('<think>still thinking')
    expect(reasoning).toBe('still thinking')
    expect(answer).toBe('')
  })

  it('leaves ordinary text alone', () => {
    expect(splitReasoning('just an answer')).toEqual({ reasoning: '', answer: 'just an answer' })
  })

  it('visibleAnswer strips reasoning, since reasoning alone is not an answer', () => {
    expect(visibleAnswer('<think>hmm</think>')).toBe('')
    expect(visibleAnswer('<think>hmm</think>Done.')).toBe('Done.')
  })
})

describe('createReasoningTagger', () => {
  it('opens a think block on the first reasoning token only', () => {
    const t = createReasoningTagger()
    expect(t.reasoning('Let me ')).toBe('<think>Let me ')
    expect(t.reasoning('check.')).toBe('check.')
  })

  it('closes the block when the answer starts', () => {
    const t = createReasoningTagger()
    t.reasoning('thinking')
    expect(t.content('Answer')).toBe('</think>Answer')
  })

  it('does not wrap content when the model never reasoned', () => {
    const t = createReasoningTagger()
    expect(t.content('Plain answer')).toBe('Plain answer')
    expect(t.end()).toBe('')
  })

  it('closes an open block at end of stream — a reasoning-only reply', () => {
    const t = createReasoningTagger()
    t.reasoning('only thought about it')
    expect(t.end()).toBe('</think>')
    expect(t.isOpen()).toBe(false)
  })

  it('round-trips through splitReasoning, which is the point', () => {
    const t = createReasoningTagger()
    const stream = [t.reasoning('why: '), t.reasoning('because'), t.content('So: 42.'), t.end()].join('')
    const { reasoning, answer } = splitReasoning(stream)
    expect(reasoning).toBe('why: because')
    expect(answer).toBe('So: 42.')
  })

  it('ignores empty deltas rather than emitting stray tags', () => {
    const t = createReasoningTagger()
    expect(t.reasoning('')).toBe('')
    expect(t.content('')).toBe('')
    expect(t.isOpen()).toBe(false)
  })
})
