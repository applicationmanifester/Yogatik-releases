import { describe, it, expect, beforeEach } from 'vitest'
import {
  getModelPricing,
  calculateTurnCost,
  recordTurnUsage,
  getUsageSummary,
  clearUsageRecords,
} from './usageAnalytics'

describe('usageAnalytics', () => {
  beforeEach(() => {
    clearUsageRecords()
  })

  it('resolves standard pricing for common models', () => {
    expect(getModelPricing('gpt-4o', 'openai')).toEqual([2.50, 10.00])
    expect(getModelPricing('claude-3-5-sonnet', 'anthropic')).toEqual([3.00, 15.00])
    expect(getModelPricing('gemini-1.5-flash', 'gemini')).toEqual([0.075, 0.30])
    expect(getModelPricing('qwen2.5', 'local')).toEqual([0, 0])
  })

  it('bills a prefixed model id at ITS OWN rate, not its prefix', () => {
    // Walking the table in literal order matched 'gpt-4o-mini' against the
    // 'gpt-4o' row and reported 16.7x the real cost. Every one of these ids
    // contains a shorter id that is also in the table, and in each case the
    // wrong answer is the expensive one — a cost meter that overstates is worse
    // than none, because it steers the user off the cheap model.
    expect(getModelPricing('gpt-4o-mini', 'openai')).toEqual([0.15, 0.60])
    expect(getModelPricing('o1-mini', 'openai')).toEqual([3.00, 12.00])
    expect(getModelPricing('o3-mini', 'openai')).toEqual([1.10, 4.40])
    expect(getModelPricing('claude-3-5-haiku', 'anthropic')).toEqual([0.80, 4.00])
  })

  it('a provider-prefixed id (openrouter style) still resolves', () => {
    expect(getModelPricing('openai/gpt-4o-mini', 'openrouter')).toEqual([0.15, 0.60])
  })

  it('calculates cost per turn accurately', () => {
    // 1,000 prompt tokens + 500 completion tokens on GPT-4o
    // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.0050 = 0.0075
    const cost = calculateTurnCost(1000, 500, 'gpt-4o', 'openai')
    expect(cost).toBeCloseTo(0.0075, 4)
  })

  it('records turn usage and aggregates summaries', () => {
    recordTurnUsage({
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 1000,
      completionTokens: 500,
      latencyMs: 800,
    })

    recordTurnUsage({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      promptTokens: 2000,
      completionTokens: 1000,
      latencyMs: 1200,
    })

    const summary = getUsageSummary()
    expect(summary.totalRequests).toBe(2)
    expect(summary.totalTokens).toBe(4500)
    expect(summary.totalPromptTokens).toBe(3000)
    expect(summary.totalCompletionTokens).toBe(1500)
    expect(summary.totalCost).toBeGreaterThan(0)
    expect(summary.byProvider['openai'].requests).toBe(1)
    expect(summary.byProvider['anthropic'].requests).toBe(1)
  })
})
