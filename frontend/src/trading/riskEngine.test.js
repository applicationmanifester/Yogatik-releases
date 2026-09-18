import { describe, it, expect, vi } from 'vitest'
import {
  calculateKellyFraction,
  calculateATRSeries,
  calculateChandelierStop,
  checkDailyCircuitBreaker,
  executeEmergencyKillSwitch,
} from './riskEngine'

describe('riskEngine — Quantitative Risk & Protection', () => {
  describe('calculateKellyFraction', () => {
    it('returns zero allocation when expected value or win rate is invalid', () => {
      expect(calculateKellyFraction({ winRate: 0, avgWin: 100, avgLoss: 50 }).appliedFraction).toBe(0)
      expect(calculateKellyFraction({ winRate: 0.5, avgWin: 0, avgLoss: 50 }).appliedFraction).toBe(0)
      expect(calculateKellyFraction({ winRate: 0.5, avgWin: 50, avgLoss: 0 }).appliedFraction).toBe(0)
      expect(calculateKellyFraction({ winRate: 1.2, avgWin: 100, avgLoss: 50 }).appliedFraction).toBe(0)
    })

    it('correctly calculates Half-Kelly sizing with positive edge', () => {
      // Win Rate: 60%, Win: 200, Loss: 100 => b = 2, q = 0.4
      // f* = (0.6 * 2 - 0.4) / 2 = (1.2 - 0.4) / 2 = 0.8 / 2 = 0.4 (40%)
      // Half-Kelly = 0.4 * 0.5 = 0.20 (20%)
      // Capped by maxCapitalPercent default (5% = 0.05)
      const res = calculateKellyFraction({
        winRate: 0.6,
        avgWin: 200,
        avgLoss: 100,
        fractionMultiplier: 0.5,
        maxCapitalPercent: 0.05,
      })

      expect(res.hasEdge).toBe(true)
      expect(res.fullKelly).toBe(0.4)
      expect(res.appliedFraction).toBe(0.05) // capped at 5% maxCapitalPercent
      expect(res.payoffRatio).toBe(2)

      // Test quantity calculation: 100k equity, stock @ 1000, stopLoss @ 980 (risk = 20/sh)
      // maxRisk = 100000 * 0.05 = 5000 => shares = 5000 / 20 = 250
      const shares = res.calculateQuantity(100000, 1000, 980)
      // shares by cash = 100000 / 1000 = 100 shares max
      expect(shares).toBe(100) // bounded by cash
    })

    it('rejects negative expectancy setups', () => {
      // Win Rate: 30%, Win: 100, Loss: 200
      const res = calculateKellyFraction({
        winRate: 0.3,
        avgWin: 100,
        avgLoss: 200,
      })
      expect(res.hasEdge).toBe(false)
      expect(res.appliedFraction).toBe(0)
    })
  })

  describe('calculateATRSeries & calculateChandelierStop', () => {
    const mockCandles = [
      { high: 105, low: 95, close: 100 },
      { high: 108, low: 98, close: 106 },
      { high: 110, low: 104, close: 109 },
      { high: 115, low: 108, close: 112 },
      { high: 120, low: 111, close: 118 },
    ]

    it('computes ATR series accurately', () => {
      const atrs = calculateATRSeries(mockCandles, 3)
      expect(atrs.length).toBe(5)
      expect(atrs[atrs.length - 1]).toBeGreaterThan(0)
    })

    it('computes ratcheted Chandelier stop for long positions', () => {
      const stop = calculateChandelierStop({
        candles: mockCandles,
        period: 5,
        multiplier: 2.0,
        side: 'LONG',
        previousStopPrice: 102,
      })

      expect(stop.highestHigh).toBe(120)
      expect(stop.stopPrice).toBeGreaterThan(100)
      // Ratchet rule: stop cannot be less than previousStopPrice
      expect(stop.stopPrice).toBeGreaterThanOrEqual(102)
      expect(stop.isTriggered).toBe(false) // current price is 118 > stopPrice
    })
  })

  describe('checkDailyCircuitBreaker', () => {
    it('flags normal status when drawdown is within safe limits', () => {
      const status = checkDailyCircuitBreaker({
        startingDayEquity: 100000,
        currentEquity: 99000, // -1%
        maxDailyDrawdownPercent: 2.5,
      })
      expect(status.isTripped).toBe(false)
      expect(status.drawdownPercent).toBe(1.0)
      expect(status.status).toBe('NORMAL')
      expect(status.remainingRiskBudget).toBe(1500) // 2500 - 1000
    })

    it('trips circuit breaker when drawdown breaches limit', () => {
      const status = checkDailyCircuitBreaker({
        startingDayEquity: 100000,
        currentEquity: 97000, // -3%
        maxDailyDrawdownPercent: 2.5,
      })
      expect(status.isTripped).toBe(true)
      expect(status.status).toBe('CIRCUIT_TRIPPED')
      expect(status.drawdownPercent).toBe(3.0)
      expect(status.remainingRiskBudget).toBe(0)
    })
  })

  describe('executeEmergencyKillSwitch', () => {
    it('cancels all orders and squares off all positions', async () => {
      const cancelMock = vi.fn().mockResolvedValue({ status: 'cancelled' })
      const squareMock = vi.fn().mockResolvedValue({ status: 'closed' })

      const openOrders = [{ id: 'ORD1' }, { id: 'ORD2' }]
      const activePositions = [
        { symbol: 'RELIANCE', quantity: 10, last_price: 2900 },
        { symbol: 'TCS', quantity: -5, last_price: 3800 },
      ]

      const report = await executeEmergencyKillSwitch({
        cancelOrderFn: cancelMock,
        squareOffPositionFn: squareMock,
        openOrders,
        activePositions,
      })

      expect(report.success).toBe(true)
      expect(cancelMock).toHaveBeenCalledTimes(2)
      expect(squareMock).toHaveBeenCalledTimes(2)
      expect(report.cancelledOrders.length).toBe(2)
      expect(report.squaredOffPositions.length).toBe(2)
    })
  })
})
