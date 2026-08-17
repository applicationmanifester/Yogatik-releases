import { describe, it, expect } from 'vitest'
import { financeTool } from './tools/finance'

const REF = { spot: 100, strike: 100, time_years: 1, volatility: 0.2, risk_free_rate: 0.05 }

describe('finance_analytics tool', () => {
  it('prices a European call at the reference value with sane Greeks', async () => {
    const r = await financeTool.execute({ operation: 'option', ...REF, option_type: 'call' })
    expect(r.success).toBe(true)
    expect(Math.abs(r.price - 10.4506)).toBeLessThan(1e-3)
    expect(r.greeks.delta).toBeGreaterThan(0.6)
    expect(r.greeks.theta_per_day).toBeLessThan(0)
  })

  it('an American put carries a non-negative early-exercise premium', async () => {
    const r = await financeTool.execute({ operation: 'option', ...REF, option_type: 'put', american: true })
    expect(r.earlyExercisePremium).toBeGreaterThanOrEqual(-1e-9)
    expect(r.price).toBeGreaterThanOrEqual(r.europeanPrice - 1e-9)
  })

  it('recovers implied volatility from a quoted price', async () => {
    const r = await financeTool.execute({ operation: 'implied_vol', ...REF, market_price: 10.4506 })
    expect(r.success).toBe(true)
    expect(Math.abs(r.impliedVolatility - 0.2)).toBeLessThan(1e-3)
  })

  it('reports an unreachable quote instead of inventing a volatility', async () => {
    const r = await financeTool.execute({ operation: 'implied_vol', ...REF, market_price: 900 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/arbitrage|stale|no volatility/i)
  })

  it('builds min-variance, risk-parity and max-Sharpe portfolios', async () => {
    const r = await financeTool.execute({
      operation: 'portfolio',
      returns_by_asset: [
        [0.02, -0.01, 0.03, 0.005, -0.02, 0.015],
        [0.005, 0.004, 0.006, 0.005, 0.003, 0.005],
      ],
      expected_returns: [0.10, 0.03],
    })
    expect(r.success).toBe(true)
    expect(r.minVariance.weights).toHaveLength(2)
    expect(Math.abs(r.riskParity.weights.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-6)
    expect(r.maxSharpe.weights).toHaveLength(2)
    expect(r.efficientFrontier.length).toBeGreaterThan(1)
  })

  it('surfaces a bad operation clearly', async () => {
    const r = await financeTool.execute({ operation: 'teleport' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown operation/i)
  })

  it('turns a thrown maths error into a tool result, never an exception', async () => {
    const r = await financeTool.execute({ operation: 'dcf', cashflows: [100], discount_rate: 0.05, terminal_growth: 0.9 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/below the discount rate/i)
  })
})

describe('finance_analytics — indicators and backtest', () => {
  const trend = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 4) * 3)

  it('computes indicators aligned to the price series', async () => {
    const r = await financeTool.execute({ operation: 'indicators', prices: trend })
    expect(r.success).toBe(true)
    expect(r.sma).toHaveLength(trend.length)
    expect(r.rsi).toHaveLength(trend.length)
    expect(r.latest.price).toBe(trend[trend.length - 1])
    expect(r.latest.rsi).toBeGreaterThan(0)
  })

  it('runs an sma_cross backtest and compares with buy-and-hold', async () => {
    const r = await financeTool.execute({ operation: 'backtest', prices: trend, strategy: 'sma_cross' })
    expect(r.success).toBe(true)
    expect(r.equityCurve).toHaveLength(trend.length)
    expect(r.comparison.buyHoldReturn).toBeGreaterThan(0)
    expect(r.caveat).toMatch(/lookahead/i)
  })

  it('trading costs reduce the backtested return', async () => {
    const free = await financeTool.execute({ operation: 'backtest', prices: trend, cost_bps: 0 })
    const paid = await financeTool.execute({ operation: 'backtest', prices: trend, cost_bps: 100 })
    expect(paid.totalReturn).toBeLessThanOrEqual(free.totalReturn)
  })

  it('refuses a series too short to backtest', async () => {
    const r = await financeTool.execute({ operation: 'backtest', prices: [1, 2] })
    expect(r.success).toBe(false)
  })
})
