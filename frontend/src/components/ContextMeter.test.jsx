import { describe, it, expect } from 'vitest'
import { estimateConversationTokens, getModelContextLimit } from './ContextMeter'

describe('ContextMeter Logic', () => {
  it('estimates tokens correctly based on chars (~4 chars per token)', () => {
    const messages = [
      { role: 'user', content: 'Hello world! How are you doing today?' }, // 37 chars
      { role: 'assistant', text: 'I am doing great, ready to help you with code and research.' } // 59 chars
    ]
    const systemPrompt = 'You are a helpful assistant.' // 28 chars
    const input = 'Write a test' // 12 chars
    // Total chars = 37 + 59 + 28 + 12 = 136 chars -> 136 / 4 = 34 tokens

    const tokens = estimateConversationTokens(messages, systemPrompt, input)
    expect(tokens).toBe(34)
  })

  it('resolves limits from the SAME table the agent budgets against', () => {
    // This component used to carry its own copy of the limits. `local` was the
    // number that differed — 8192 here against compaction.js's 4096 — so a
    // wired meter would have shown the user 50% headroom they did not have,
    // while the agent compacted their history away underneath them. The meter
    // must read the table with teeth, not a second opinion.
    expect(getModelContextLimit('gemini', 'gemini-1.5-pro')).toBe(1000000)
    expect(getModelContextLimit('anthropic', 'claude-3-7-sonnet')).toBe(200000)
    expect(getModelContextLimit('openai', 'gpt-4o')).toBe(128000)
    expect(getModelContextLimit('local', '')).toBe(4096)
  })

  it('agrees with compaction.js for every provider it knows', async () => {
    const { getModelContextLimits } = await import('../compaction')
    for (const [p, m] of [
      ['gemini', 'gemini-1.5-pro'], ['anthropic', 'claude-3-7-sonnet'],
      ['openai', 'gpt-4o'], ['groq', 'llama-3.3-70b-versatile'],
      ['deepseek', 'deepseek-chat'], ['local', 'Qwen2.5-0.5B'], ['unknown', 'whatever'],
    ]) {
      expect(getModelContextLimit(p, m), `${p}/${m}`).toBe(getModelContextLimits(p, m).estimatedMaxTokens)
    }
  })
})
