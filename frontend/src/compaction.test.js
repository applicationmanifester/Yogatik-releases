import { describe, it, expect } from 'vitest'
import { splitForCompaction, buildCompactionPrompt, formatSummaryTurn, compactHistory, getModelContextLimits, estimateTokens } from './compaction'

function turns(n, size = 100) {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `msg${i} ` + 'x'.repeat(size),
  }))
}

describe('splitForCompaction', () => {
  it('keeps everything when it already fits', () => {
    const h = turns(4, 10)
    const { toSummarize, keep } = splitForCompaction(h, 100000, 20)
    expect(toSummarize).toEqual([])
    expect(keep).toHaveLength(4)
  })

  it('summarizes the oldest turns and keeps the newest', () => {
    const h = turns(20, 500)
    const { toSummarize, keep } = splitForCompaction(h, 3000, 20)
    expect(toSummarize.length).toBeGreaterThan(0)
    expect(keep.length).toBeGreaterThan(0)
    expect(toSummarize.length + keep.length).toBe(20)
    // the newest turn is always kept
    expect(keep[keep.length - 1].content).toBe(h[19].content)
  })

  it('never summarizes everything — recent context must survive', () => {
    const h = turns(20, 5000)
    const { keep } = splitForCompaction(h, 100, 20)
    expect(keep.length).toBeGreaterThanOrEqual(1)
  })

  it('respects a max turn count even when the budget is huge', () => {
    const h = turns(40, 10)
    const { toSummarize, keep } = splitForCompaction(h, 1000000, 10)
    expect(keep).toHaveLength(10)
    expect(toSummarize).toHaveLength(30)
  })

  it('handles an empty history', () => {
    expect(splitForCompaction([], 1000, 10)).toEqual({ toSummarize: [], keep: [] })
  })
})

describe('buildCompactionPrompt', () => {
  it('includes the text of the turns being dropped', () => {
    const p = buildCompactionPrompt([{ role: 'user', content: 'the secret is 42' }])
    expect(p).toContain('the secret is 42')
  })

  it('asks for facts, decisions and open threads', () => {
    const p = buildCompactionPrompt([{ role: 'user', content: 'x' }])
    expect(p).toMatch(/decision/i)
  })

  it('skips array (multimodal) content safely', () => {
    const p = buildCompactionPrompt([{ role: 'user', content: [{ type: 'image_url' }] }])
    expect(typeof p).toBe('string')
  })
})

describe('formatSummaryTurn', () => {
  it('marks the summary clearly as compacted history', () => {
    const t = formatSummaryTurn('They chose Postgres.')
    expect(t.role).toBe('user')
    expect(t.content).toMatch(/earlier/i)
    expect(t.content).toContain('They chose Postgres.')
  })
})

describe('compactHistory', () => {
  it('passes short history straight through without calling the model', async () => {
    let called = false
    const out = await compactHistory(turns(4, 10), {
      budget: 100000, maxTurns: 20, summarize: async () => { called = true; return 's' },
    })
    expect(called).toBe(false)
    expect(out).toHaveLength(4)
  })

  it('replaces dropped turns with one summary turn', async () => {
    const h = turns(20, 500)
    const out = await compactHistory(h, {
      budget: 3000, maxTurns: 20, summarize: async () => 'SUMMARY OF EARLIER',
    })
    expect(out[0].content).toContain('SUMMARY OF EARLIER')
    expect(out.length).toBeLessThan(h.length)
  })

  it('falls back to plain truncation when summarization fails', async () => {
    const h = turns(20, 500)
    const out = await compactHistory(h, {
      budget: 3000, maxTurns: 20, summarize: async () => { throw new Error('model down') },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(h.length)
    expect(out[0].content).not.toContain('SUMMARY')
  })

  it('does not lose the most recent turn', async () => {
    const h = turns(20, 500)
    const out = await compactHistory(h, {
      budget: 3000, maxTurns: 20, summarize: async () => 'S',
    })
    expect(out[out.length - 1].content).toBe(h[19].content)
  })
})

describe('compactHistory normalization', () => {
  it('strips stray fields so only role/content reach the provider', async () => {
    const h = [{ role: 'user', content: 'hi', tool_calls: [{ id: 'x' }], id: 99 }]
    const out = await compactHistory(h, { budget: 10000, maxTurns: 10, summarize: async () => 's' })
    expect(Object.keys(out[0]).sort()).toEqual(['content', 'role'])
  })

  it('passes multimodal array content through instead of stringifying it', async () => {
    const parts = [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:...' } }]
    const out = await compactHistory([{ role: 'user', content: parts }], {
      budget: 10000, maxTurns: 10, summarize: async () => 's',
    })
    expect(Array.isArray(out[0].content)).toBe(true)
    expect(out[0].content).toEqual(parts)
  })
})

describe('getModelContextLimits & estimateTokens', () => {
  it('assigns larger context budgets to large-window models', () => {
    const gemini = getModelContextLimits('gemini', 'gemini-1.5-pro')
    const claude = getModelContextLimits('anthropic', 'claude-3-7-sonnet')
    const gpt = getModelContextLimits('openai', 'gpt-4o')
    const local = getModelContextLimits('local', 'Qwen2.5-0.5B')

    expect(gemini.budget).toBeGreaterThan(gpt.budget)
    expect(claude.budget).toBeGreaterThan(gpt.budget)
    expect(gpt.budget).toBeGreaterThan(local.budget)
    expect(local.budget).toBe(4000)
    expect(local.maxTurns).toBe(6)
  })

  it('estimates token counts with character ratios and turn overheads', () => {
    const tokens = estimateTokens('Hello world! How are you?')
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(10)

    const turnTokens = estimateTokens([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'World' },
    ])
    expect(turnTokens).toBeGreaterThan(8)
  })

  it('preserves tool_calls on assistant turns and tool_call_id on tool turns', async () => {
    const h = [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', function: { name: 'fs_write' } }] },
      { role: 'tool', tool_call_id: 'call_1', name: 'fs_write', content: '{"ok":true}' },
    ]
    const out = await compactHistory(h, { budget: 10000, maxTurns: 10, summarize: async () => 's' })
    expect(out[0].tool_calls).toBeDefined()
    expect(out[0].tool_calls[0].id).toBe('call_1')
    expect(out[1].tool_call_id).toBe('call_1')
    expect(out[1].name).toBe('fs_write')
  })

  it('prevents keep from starting with an orphaned tool turn', () => {
    const h = [
      { role: 'assistant', content: 'thinking...', tool_calls: [{ id: 'c1' }] },
      { role: 'tool', tool_call_id: 'c1', content: 'res1' },
      { role: 'user', content: 'next question' },
    ]
    // Force a split that would drop the assistant but keep the tool
    const { keep } = splitForCompaction(h, 20, 2)
    expect(keep[0].role).not.toBe('tool')
  })
})
