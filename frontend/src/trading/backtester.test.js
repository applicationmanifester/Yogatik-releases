import { describe, it, expect } from 'vitest'
import {
  calculateIndianMarketFees,
  calculateDynamicSlippage,
  generateSyntheticCandles,
  runVectorBacktest,
} from './backtester'

describe('backtester — Vector Backtest & Indian Market Friction', () => {
  describe('calculateIndianMarketFees', () => {
    it('accurately computes intraday statutory charges on BUY order', () => {
      // 100 shares @ ₹2,500 = ₹2,50,000 turnover
      const fees = calculateIndianMarketFees({
        side: 'BUY',
        price: 2500,
        quantity: 100,
        segment: 'equity_intraday',
      })

      expect(fees.turnover).toBe(250000)
      expect(fees.brokerage).toBe(20) // ₹20 flat cap (since 0.03% of 250k is 75 > 20)
      expect(fees.stt).toBe(0) // No STT on intraday BUY
      expect(fees.stampDuty).toBe(7.5) // 0.003% of 250,000
      expect(fees.exchangeCharges).toBe(8.63) // 0.00345% rounded to 2 decimal places
      expect(fees.gst).toBeGreaterThan(5) // 18% of (20 + 8.625)
      expect(fees.totalFees).toBeGreaterThan(40)
    })

    it('accurately applies STT on intraday SELL order', () => {
      // 100 shares @ ₹2,600 = ₹2,60,000 turnover
      const fees = calculateIndianMarketFees({
        side: 'SELL',
        price: 2600,
        quantity: 100,
        segment: 'equity_intraday',
      })

      expect(fees.stt).toBe(65) // 0.025% of 2,60,000 = 65
      expect(fees.stampDuty).toBe(0) // No stamp duty on SELL
      expect(fees.brokerage).toBe(20)
      expect(fees.totalFees).toBeGreaterThan(95)
    })

    it('handles zero quantity or price gracefully', () => {
      const fees = calculateIndianMarketFees({ side: 'BUY', price: 0, quantity: 0 })
      expect(fees.totalFees).toBe(0)
      expect(fees.turnover).toBe(0)
    })
  })

  describe('calculateDynamicSlippage', () => {
    it('applies slippage on buy and sell executions', () => {
      const candle = { high: 2520, low: 2480 }
      const buySlip = calculateDynamicSlippage({ candle, side: 'BUY', price: 2500, slippageBps: 3 })
      const sellSlip = calculateDynamicSlippage({ candle, side: 'SELL', price: 2500, slippageBps: 3 })

      expect(buySlip.effectivePrice).toBeGreaterThan(2500)
      expect(sellSlip.effectivePrice).toBeLessThan(2500)
      expect(buySlip.slippagePerShare).toBeGreaterThan(0)
    })
  })

  describe('generateSyntheticCandles & runVectorBacktest', () => {
    it('generates candles and executes backtest calculating institutional metrics', () => {
      const candles = generateSyntheticCandles({
        basePrice: 2500,
        count: 150,
        trend: 'bullish',
        volatility: 0.012,
      })

      expect(candles.length).toBe(150)
      expect(candles[0].close).toBeGreaterThan(0)

      const result = runVectorBacktest(candles, {
        initialCapital: 100000,
        maxRiskPerTrade: 0.02,
        profitTargetPct: 2.0,
        stopLossPct: 1.0,
        trailingStop: true,
      })

      expect(result.success).toBe(true)
      expect(result.metrics).toBeDefined()
      expect(result.metrics.initialCapital).toBe(100000)
      expect(typeof result.metrics.totalReturnPercent).toBe('number')
      expect(typeof result.metrics.sharpeRatio).toBe('number')
      expect(typeof result.metrics.sortinoRatio).toBe('number')
      expect(typeof result.metrics.maxDrawdownPercent).toBe('number')
      expect(Array.isArray(result.equityCurve)).toBe(true)
      expect(result.equityCurve.length).toBeGreaterThan(0)
    })

    it('rejects candle sets with insufficient data bars', () => {
      const result = runVectorBacktest([{ close: 100 }, { close: 102 }])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Insufficient candle data')
    })
  })
})
