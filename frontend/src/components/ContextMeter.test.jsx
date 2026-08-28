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

  it('resolves correct model limits', () => {
    expect(getModelContextLimit('gemini', 'gemini-1.5-pro')).toBe(1000000)
    expect(getModelContextLimit('anthropic', 'claude-3-7-sonnet')).toBe(200000)
    expect(getModelContextLimit('openai', 'gpt-4o')).toBe(128000)
    expect(getModelContextLimit('local', '')).toBe(8192)
  })
})
