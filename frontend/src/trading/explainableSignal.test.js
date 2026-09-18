import { describe, it, expect } from 'vitest'
import { evaluateExplainableSignal } from './explainableSignal'

describe('explainableSignal — Transparent Quantitative Scoring & Rationale', () => {
  it('awards high score and A+ grade to high-quality confluent setups', () => {
    const signal = evaluateExplainableSignal({
      symbol: 'RELIANCE',
      currentPrice: 2950,
      rsi: 54, // optimal
      sma20: 2920,
      sma50: 2880, // golden alignment
      currentVolume: 250000,
      avgVolume: 100000, // 2.5x volume surge
      stopLoss: 2900, // 50 risk
      targetPrice: 3075, // 125 reward (R:R = 2.5)
      portfolioEquity: 200000,
    })

    expect(signal.totalScore).toBeGreaterThanOrEqual(80)
    expect(['A+', 'A']).toContain(signal.grade)
    expect(['STRONG_BUY', 'BUY']).toContain(signal.recommendation)
    expect(signal.factors.momentum.score).toBeGreaterThan(30)
    expect(signal.factors.volume.score).toBe(35)
    expect(signal.factors.payoff.score).toBe(25)
    expect(signal.factors.payoff.riskRewardRatio).toBe(2.5)
    expect(signal.rationale).toContain('RELIANCE')
    expect(signal.rationale).toContain('Half-Kelly recommends')
    expect(signal.kellySizing.recommendedQuantity).toBeGreaterThan(0)
  })

  it('penalizes poor risk-reward and low participation setups', () => {
    const signal = evaluateExplainableSignal({
      symbol: 'WEAKSTOCK',
      currentPrice: 100,
      rsi: 80, // overbought
      sma20: 105,
      sma50: 110, // downtrend
      currentVolume: 30000,
      avgVolume: 100000, // 0.3x volume
      stopLoss: 90, // 10 risk
      targetPrice: 105, // 5 reward (R:R = 0.5)
      portfolioEquity: 100000,
    })

    expect(signal.totalScore).toBeLessThan(45)
    expect(signal.grade).toBe('C')
    expect(signal.recommendation).toBe('AVOID')
    expect(signal.factors.payoff.score).toBeLessThanOrEqual(5)
  })
})
