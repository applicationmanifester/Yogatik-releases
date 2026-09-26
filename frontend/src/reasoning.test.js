import { describe, it, expect } from 'vitest'
import { splitReasoning, visibleAnswer, createReasoningTagger } from './reasoning'

describe('splitReasoning', () => {
  it('separates a closed think block from the answer', () => {
    const { reasoning, answer } = splitReasoning('<think>weighing it up</think>The answer is 4.')
    expect(reasoning).toBe('weighing it up')
    expect(answer).toBe('The answer is 4.')
  })

  it('separates <thought> and <reasoning> blocks from the answer', () => {
    const res1 = splitReasoning('<thought>deep thought</thought>The solution.')
    expect(res1.reasoning).toBe('deep thought')
    expect(res1.answer).toBe('The solution.')

    const res2 = splitReasoning('<reasoning>step 1</reasoning>Done.')
    expect(res2.reasoning).toBe('step 1')
    expect(res2.answer).toBe('Done.')
  })

  it('handles tags with attributes (e.g. <think class="reasoning">)', () => {
    const { reasoning, answer } = splitReasoning('<think class="reasoning">internal thoughts</think>Hello world')
    expect(reasoning).toBe('internal thoughts')
    expect(answer).toBe('Hello world')
  })

  it('captures an UNCLOSED block, so reasoning is visible while it streams', () => {
    const { reasoning, answer } = splitReasoning('<think>still thinking')
    expect(reasoning).toBe('still thinking')
    expect(answer).toBe('')

    const resThought = splitReasoning('<thought>streaming thoughts...')
    expect(resThought.reasoning).toBe('streaming thoughts...')
    expect(resThought.answer).toBe('')
  })

  it('leaves ordinary text alone', () => {
    expect(splitReasoning('just an answer')).toEqual({ reasoning: '', answer: 'just an answer' })
  })

  it('visibleAnswer strips reasoning, since reasoning alone is not an answer', () => {
    expect(visibleAnswer('<think>hmm</think>')).toBe('')
    expect(visibleAnswer('<thought>hmm</thought>')).toBe('')
    expect(visibleAnswer('<think>hmm</think>Done.')).toBe('Done.')
    expect(visibleAnswer('<reasoning>hmm</reasoning>Done.')).toBe('Done.')
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

  it('detects and suppresses runaway dots/ellipsis repetition loops in content stream', () => {
    const t = createReasoningTagger()
    const outputs = [t.content("I'll start by exploring the workspace ")]
    for (let i = 0; i < 10; i++) {
      outputs.push(t.content('... '))
    }
    expect(outputs.some(o => o.includes('repetitive filler loop truncated'))).toBe(true)
    expect(t.isContentLoopSuppressed()).toBe(true)
    // Any subsequent tokens are suppressed
    expect(t.content('... ')).toBe('')
  })

  it('visibleAnswer strips bracketed pseudo tool announcements', () => {
    expect(visibleAnswer('[Tool called: fs_file_tree for workspace exploration]')).toBe('')
    expect(visibleAnswer('Analyzing workspace:\n[Tool called: fs_file_tree for workspace exploration]')).toBe('Analyzing workspace:')
  })
})
