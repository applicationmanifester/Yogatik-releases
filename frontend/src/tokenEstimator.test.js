import { describe, it, expect } from 'vitest'
import {
  CHARS_PER_TOKEN,
  estimateTokensFromText,
  estimateTokensFromMessage,
  estimateTokensFromHistory,
  estimateConversationTokens,
  formatTokenCount,
  calculateUsagePercent,
  getUsageColor,
} from './tokenEstimator'

describe('tokenEstimator — unified token estimation', () => {
  describe('CHARS_PER_TOKEN constant', () => {
    it('uses ~3.8 chars per token for mixed English + code', () => {
      expect(CHARS_PER_TOKEN).toBe(3.8)
    })
  })

  describe('estimateTokensFromText', () => {
    it('estimates tokens from a string', () => {
      expect(estimateTokensFromText('Hello world!')).toBe(Math.ceil(12 / 3.8))
      expect(estimateTokensFromText('')).toBe(0)
      expect(estimateTokensFromText(null)).toBe(0)
      expect(estimateTokensFromText(undefined)).toBe(0)
    })

    it('handles long text', () => {
      const longText = 'x'.repeat(3800) // 1000 tokens at 3.8 chars/token
      expect(estimateTokensFromText(longText)).toBe(1000)
    })
  })

  describe('estimateTokensFromMessage', () => {
    it('estimates from string content', () => {
      const msg = { content: 'Hello world!' }
      expect(estimateTokensFromMessage(msg)).toBe(Math.ceil(12 / 3.8) + 4) // +4 overhead
    })

    it('estimates from text field', () => {
      const msg = { text: 'Hello world!' }
      expect(estimateTokensFromMessage(msg)).toBe(Math.ceil(12 / 3.8) + 4)
    })

    it('estimates from array content (multimodal)', () => {
      const msg = { content: [{ type: 'text', text: 'Hello' }, { type: 'image_url', image_url: { url: 'data:...' } }] }
      expect(estimateTokensFromMessage(msg)).toBe(Math.ceil(5 / 3.8) + 4)
    })

    it('includes toolResults in estimation', () => {
      const msg = { content: 'Hello', toolResults: [{ tool: 'weather', result: { temp: 72 } }] }
      const tokens = estimateTokensFromMessage(msg)
      expect(tokens).toBeGreaterThan(Math.ceil(5 / 3.8) + 4)
    })

    it('handles empty/null messages', () => {
      expect(estimateTokensFromMessage(null)).toBe(0)
      expect(estimateTokensFromMessage({})).toBe(4) // just overhead
    })
  })

  describe('estimateTokensFromHistory', () => {
    it('sums tokens across messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]
      const total = estimateTokensFromHistory(messages)
      const expected = Math.ceil(5 / 3.8) + 4 + Math.ceil(9 / 3.8) + 4
      expect(total).toBe(expected)
    })

    it('returns 0 for empty array', () => {
      expect(estimateTokensFromHistory([])).toBe(0)
    })

    it('returns 0 for non-array', () => {
      expect(estimateTokensFromHistory(null)).toBe(0)
      expect(estimateTokensFromHistory('not an array')).toBe(0)
    })
  })

  describe('estimateConversationTokens', () => {
    it('combines system, history, and input', () => {
      const result = estimateConversationTokens({
        systemPrompt: 'System prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        input: 'User input',
      })
      const expected = Math.ceil(13 / 3.8) + (Math.ceil(5 / 3.8) + 4) + Math.ceil(10 / 3.8)
      expect(result).toBe(expected)
    })

    it('handles missing fields gracefully', () => {
      expect(estimateConversationTokens({})).toBe(0)
      expect(estimateConversationTokens({ systemPrompt: 'test' })).toBe(Math.ceil(4 / 3.8))
    })
  })

  describe('formatTokenCount', () => {
    it('formats small numbers as-is', () => {
      expect(formatTokenCount(0)).toBe('0')
      expect(formatTokenCount(500)).toBe('500')
      expect(formatTokenCount(999)).toBe('999')
    })

    it('formats thousands with k', () => {
      expect(formatTokenCount(1000)).toBe('1.0k')
      expect(formatTokenCount(1500)).toBe('1.5k')
      expect(formatTokenCount(99999)).toBe('100.0k')
    })

    it('formats millions with M', () => {
      expect(formatTokenCount(1000000)).toBe('1.0M')
      expect(formatTokenCount(1500000)).toBe('1.5M')
    })
  })

  describe('calculateUsagePercent', () => {
    it('calculates percentage correctly', () => {
      expect(calculateUsagePercent(50, 100)).toBe(50)
      expect(calculateUsagePercent(33, 100)).toBe(33)
      expect(calculateUsagePercent(100, 100)).toBe(100)
    })

    it('clamps at 100%', () => {
      expect(calculateUsagePercent(150, 100)).toBe(100)
    })

    it('handles zero limit', () => {
      expect(calculateUsagePercent(50, 0)).toBe(0)
      expect(calculateUsagePercent(50, -1)).toBe(0)
    })
  })

  describe('getUsageColor', () => {
    it('returns green for <60%', () => {
      expect(getUsageColor(0)).toBe('#34d399')
      expect(getUsageColor(59)).toBe('#34d399')
    })

    it('returns yellow for 60-85%', () => {
      expect(getUsageColor(60)).toBe('#fbbf24')
      expect(getUsageColor(85)).toBe('#fbbf24')
    })

    it('returns red for >85%', () => {
      expect(getUsageColor(86)).toBe('#f87171')
      expect(getUsageColor(100)).toBe('#f87171')
    })
  })

  describe('consistency with compaction.js', () => {
    it('uses same CHARS_PER_TOKEN as compaction estimateTokens', async () => {
      const { estimateTokens } = await import('./compaction')
      const testText = 'Hello world! This is a test message with some code: const x = 1;'
      
      // Both should use the same estimation logic now
      const directEstimate = estimateTokensFromText(testText)
      const compactionEstimate = estimateTokens(testText)
      
      expect(directEstimate).toBe(compactionEstimate)
    })

    it('history estimation matches between modules', async () => {
      const { estimateTokens } = await import('./compaction')
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! How can I help?' },
      ]
      
      const directEstimate = estimateTokensFromHistory(messages)
      const compactionEstimate = estimateTokens(messages)
      
      expect(directEstimate).toBe(compactionEstimate)
    })
  })
})
