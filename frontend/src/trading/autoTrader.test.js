import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runAutoTraderCycle, DEFAULT_WATCHLIST } from './autoTrader'
import { resetPaperPortfolio, getTradingConfig, saveTradingConfig } from './tradingStorage'
import * as paperEngine from './paperEngine'
import * as zerodhaTrade from '../tools/zerodhaTrade'

describe('autoTrader engine', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPaperPortfolio()
  })

  it('scans watchlist and only acts on high-probability setups', async () => {
    // Mock analyzeStock: TCS has high score (82), INFY has mediocre score (55)
    vi.spyOn(zerodhaTrade, 'analyzeStock').mockImplementation(async (symbol) => {
      if (symbol === 'TCS') {
        return {
          symbol: 'NSE:TCS',
          currentPrice: 3500,
          setupScore: 82,
          recommendation: 'STRONG BUY / ACCUMULATE',
          side: 'BUY',
          keyLevels: {
            entryRange: '₹3480 - ₹3500',
            stopLoss: 3430,
            target1: 3600,
            target2: 3700,
            riskRewardRatio: '1:2.8',
          },
          reasons: ['Bullish moving average alignment', 'Healthy RSI momentum'],
        }
      }
      return {
        symbol: `NSE:${symbol}`,
        currentPrice: 1500,
        setupScore: 52,
        recommendation: 'HOLD / NEUTRAL',
        side: 'HOLD',
        keyLevels: { stopLoss: 1470, target1: 1540 },
        reasons: [],
      }
    })

    const result = await runAutoTraderCycle({
      watchlist: ['TCS', 'INFY'],
      minSetupScore: 75,
    })

    expect(result.success).toBe(true)
    expect(result.scannedCount).toBe(2)
    // Only TCS should trigger an entry
    expect(result.topSetups.length).toBe(1)
    expect(result.topSetups[0].symbol).toBe('NSE:TCS')
    expect(result.actionsTaken.length).toBe(1)
    expect(result.actionsTaken[0].type).toBe('ENTRY')
    expect(result.actionsTaken[0].symbol).toBe('TCS')

    // Verify paper portfolio updated
    const config = getTradingConfig()
    expect(config.paperHoldings['NSE:TCS']).toBeDefined()
    expect(config.paperHoldings['NSE:TCS'].qty).toBeGreaterThan(0)
  })

  it('automatically takes profit when target threshold is reached', async () => {
    // Pre-populate a position: bought INFY @ 1000
    saveTradingConfig({
      paperBalance: 90000,
      paperHoldings: {
        'NSE:INFY': { symbol: 'NSE:INFY', qty: 10, avgPrice: 1000, exchange: 'NSE' },
      },
    })

    // Mock live price rising to 1050 (+5% gain)
    vi.spyOn(paperEngine, 'resolveLiveStockPrice').mockResolvedValue({
      price: 1050,
      currency: 'INR',
      symbol: 'INFY',
    })

    // Run cycle with profit target of 3.5%
    const result = await runAutoTraderCycle({
      watchlist: [],
      profitTargetPercent: 3.5,
    })

    expect(result.success).toBe(true)
    expect(result.actionsTaken.some(a => a.type === 'TAKE_PROFIT')).toBe(true)

    // Verify position was sold and profit booked
    const config = getTradingConfig()
    expect(config.paperHoldings['NSE:INFY']).toBeUndefined()
    expect(config.paperBalance).toBeGreaterThan(90000 + 10000) // Original + profit
  })

  it('automatically triggers stop loss to cut losing positions', async () => {
    // Pre-populate a position: bought RELIANCE @ 3000
    saveTradingConfig({
      paperBalance: 70000,
      paperHoldings: {
        'NSE:RELIANCE': { symbol: 'NSE:RELIANCE', qty: 5, avgPrice: 3000, exchange: 'NSE' },
      },
    })

    // Mock live price dropping to 2900 (-3.3% loss)
    vi.spyOn(paperEngine, 'resolveLiveStockPrice').mockResolvedValue({
      price: 2900,
      currency: 'INR',
      symbol: 'RELIANCE',
    })

    const result = await runAutoTraderCycle({
      watchlist: [],
    })

    expect(result.success).toBe(true)
    expect(result.actionsTaken.some(a => a.type === 'STOP_LOSS')).toBe(true)

    const config = getTradingConfig()
    expect(config.paperHoldings['NSE:RELIANCE']).toBeUndefined()
  })
})
