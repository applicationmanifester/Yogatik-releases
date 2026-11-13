import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  extractUsageFromResponse,
  extractUsageFromStreamChunk,
  TokenUsageAccumulator,
  createTokenUsageTracker,
  estimateMessageUsage,
} from './tokenTracker'

// Mock the tokenEstimator
vi.mock('./tokenEstimator', () => ({
  estimateTokensFromText: vi.fn((text) => Math.ceil(text.length / 3.8)),
  formatTokenCount: vi.fn((num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
    return String(num)
  }),
}))

describe('tokenTracker — real token usage tracking', () => {
  describe('extractUsageFromResponse', () => {
    it('extracts usage from OpenAI-compatible format', () => {
      const data = {
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      }
      const result = extractUsageFromResponse(data, 'openai')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from OpenAI with input/output tokens', () => {
      const data = { usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
      const result = extractUsageFromResponse(data, 'openrouter')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Anthropic format', () => {
      const data = { usage: { input_tokens: 100, output_tokens: 50 } }
      const result = extractUsageFromResponse(data, 'anthropic')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Gemini format', () => {
      const data = { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 } }
      const result = extractUsageFromResponse(data, 'gemini')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Cohere format', () => {
      const data = { meta: { tokens: { input_tokens: 100, output_tokens: 50 } } }
      const result = extractUsageFromResponse(data, 'cohere')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Perplexity format', () => {
      const data = { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
      const result = extractUsageFromResponse(data, 'perplexity')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from xAI format', () => {
      const data = { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
      const result = extractUsageFromResponse(data, 'xai')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Cerebras format', () => {
      const data = { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
      const result = extractUsageFromResponse(data, 'cerebras')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts usage from Ollama format', () => {
      const data = { usage: { prompt_eval_count: 100, eval_count: 50 } }
      const result = extractUsageFromResponse(data, 'ollama')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('returns null for unknown format', () => {
      const data = { some: 'data' }
      const result = extractUsageFromResponse(data, 'unknown')
      expect(result).toBeNull()
    })

    it('returns null for null/undefined', () => {
      expect(extractUsageFromResponse(null, 'openai')).toBeNull()
      expect(extractUsageFromResponse(undefined, 'openai')).toBeNull()
    })
  })

  describe('extractUsageFromStreamChunk', () => {
    it('extracts from OpenAI-compatible streaming chunk with usage', () => {
      const chunk = { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
      const result = extractUsageFromStreamChunk(chunk, 'openai')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts from Anthropic message_stop event', () => {
      const chunk = { type: 'message_stop', usage: { input_tokens: 100, output_tokens: 50 } }
      const result = extractUsageFromStreamChunk(chunk, 'anthropic')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts from Anthropic content_block_stop', () => {
      const chunk = { type: 'content_block_stop', usage: { input_tokens: 100, output_tokens: 50 } }
      const result = extractUsageFromStreamChunk(chunk, 'anthropic')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('extracts from Gemini usageMetadata', () => {
      const chunk = { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 } }
      const result = extractUsageFromStreamChunk(chunk, 'gemini')
      expect(result).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
    })

    it('returns null for chunks without usage', () => {
      const chunk = { choices: [{ delta: { content: 'hello' } }] }
      const result = extractUsageFromStreamChunk(chunk, 'openai')
      expect(result).toBeNull()
    })
  })

  describe('TokenUsageAccumulator', () => {
    let accumulator

    beforeEach(() => {
      accumulator = new TokenUsageAccumulator()
    })

    it('starts with zero usage', () => {
      const usage = accumulator.getTotalUsage()
      expect(usage.promptTokens).toBe(0)
      expect(usage.completionTokens).toBe(0)
      expect(usage.totalTokens).toBe(0)
      expect(usage.source).toBe('estimated')
    })

    it('accumulates real usage', () => {
      accumulator.addRealUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      accumulator.addRealUsage({ promptTokens: 50, completionTokens: 25, totalTokens: 75 })
      
      const usage = accumulator.getTotalUsage()
      expect(usage.promptTokens).toBe(150)
      expect(usage.completionTokens).toBe(75)
      expect(usage.totalTokens).toBe(225)
      expect(usage.source).toBe('real')
    })

    it('accumulates estimated usage', () => {
      accumulator.addEstimatedUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      accumulator.addEstimatedUsage({ promptTokens: 50, completionTokens: 25, totalTokens: 75 })
      
      const usage = accumulator.getTotalUsage()
      expect(usage.promptTokens).toBe(150)
      expect(usage.completionTokens).toBe(75)
      expect(usage.totalTokens).toBe(225)
      expect(usage.source).toBe('estimated')
    })

    it('prefers real usage over estimated', () => {
      accumulator.addEstimatedUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      accumulator.addRealUsage({ promptTokens: 50, completionTokens: 25, totalTokens: 75 })
      
      const usage = accumulator.getTotalUsage()
      expect(usage.promptTokens).toBe(50)
      expect(usage.completionTokens).toBe(25)
      expect(usage.totalTokens).toBe(75)
      expect(usage.source).toBe('real')
    })

    it('tracks hasRealData correctly', () => {
      expect(accumulator.hasRealData()).toBe(false)
      accumulator.addRealUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
      expect(accumulator.hasRealData()).toBe(true)
    })

    it('resets correctly', () => {
      accumulator.addRealUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      accumulator.reset()
      
      expect(accumulator.hasRealData()).toBe(false)
      expect(accumulator.getTotalUsage().totalTokens).toBe(0)
    })

    it('getBreakdown returns correct structure', () => {
      accumulator.addRealUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      const breakdown = accumulator.getBreakdown()
      
      expect(breakdown).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        source: 'real',
        hasRealData: true,
      })
    })
  })

  describe('createTokenUsageTracker', () => {
    it('creates tracker with callback', () => {
      const onUpdate = vi.fn()
      const tracker = createTokenUsageTracker(onUpdate)
      
      expect(tracker.accumulator).toBeInstanceOf(TokenUsageAccumulator)
      expect(typeof tracker.processChunk).toBe('function')
      expect(typeof tracker.processResponse).toBe('function')
      expect(typeof tracker.addEstimate).toBe('function')
      expect(typeof tracker.getUsage).toBe('function')
      expect(typeof tracker.reset).toBe('function')
    })

    it('calls callback on real usage update', () => {
      const onUpdate = vi.fn()
      const tracker = createTokenUsageTracker(onUpdate)
      
      tracker.processChunk({ usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }, 'openai')
      
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        source: 'real',
        hasRealData: true,
      }))
    })

    it('calls callback on estimate update', () => {
      const onUpdate = vi.fn()
      const tracker = createTokenUsageTracker(onUpdate)
      
      tracker.addEstimate({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        source: 'estimated',
        hasRealData: false,
      }))
    })
  })

  describe('estimateMessageUsage', () => {
    it('estimates user message as prompt tokens', () => {
      const message = { content: 'Hello world!' }
      const result = estimateMessageUsage(message, false)
      expect(result.promptTokens).toBeGreaterThan(0)
      expect(result.completionTokens).toBe(0)
      expect(result.totalTokens).toBe(result.promptTokens)
    })

    it('estimates assistant message as completion tokens', () => {
      const message = { content: 'Hello world!' }
      const result = estimateMessageUsage(message, true)
      expect(result.promptTokens).toBe(0)
      expect(result.completionTokens).toBeGreaterThan(0)
      expect(result.totalTokens).toBe(result.completionTokens)
    })

    it('handles array content', () => {
      const message = { content: [{ type: 'text', text: 'Hello' }] }
      const result = estimateMessageUsage(message, false)
      expect(result.promptTokens).toBeGreaterThan(0)
    })

    it('handles empty message', () => {
      const result = estimateMessageUsage(null, false)
      expect(result).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
    })
  })
})
