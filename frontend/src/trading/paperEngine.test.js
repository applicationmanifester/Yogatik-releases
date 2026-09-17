import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  executePaperOrder,
  getPaperPortfolio,
  resolveLiveStockPrice,
} from './paperEngine'
import { resetPaperPortfolio, getTradingConfig, saveTradingConfig } from './tradingStorage'
import { marketDataTool } from '../tools/marketData'

describe('paperEngine', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPaperPortfolio()
    vi.spyOn(marketDataTool, 'execute').mockResolvedValue({
      success: true,
      prices: [2500],
    })
  })

  it('starts with 1,00,000 INR virtual cash', async () => {
    const portfolio = await getPaperPortfolio()
    expect(portfolio.cashBalance).toBe(100000)
    expect(portfolio.holdings.length).toBe(0)
    expect(portfolio.netWorth).toBe(100000)
  })

  it('executes simulated BUY orders and updates cash and holdings', async () => {
    const res = await executePaperOrder({
      symbol: 'TCS',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 5,
      orderType: 'LIMIT',
      limitPrice: 3500,
    })

    expect(res.success).toBe(true)
    expect(res.side).toBe('BUY')
    expect(res.quantity).toBe(5)
    expect(res.executionPrice).toBe(3500)
    expect(res.totalCost).toBe(17500)
    expect(res.remainingBalance).toBe(82500)

    const portfolio = await getPaperPortfolio()
    expect(portfolio.cashBalance).toBe(82500)
    expect(portfolio.holdings.length).toBe(1)
    expect(portfolio.holdings[0].symbol).toBe('NSE:TCS')
    expect(portfolio.holdings[0].quantity).toBe(5)
  })

  it('rejects BUY order when paper balance is insufficient', async () => {
    await expect(
      executePaperOrder({
        symbol: 'MRF',
        exchange: 'NSE',
        side: 'BUY',
        quantity: 10,
        orderType: 'LIMIT',
        limitPrice: 150000, // 15 Lakhs, exceeds 1 Lakh
      })
    ).rejects.toThrow('Insufficient paper funds')
  })

  it('executes simulated SELL orders and computes realized P&L', async () => {
    // Buy 10 @ 1000 = 10,000
    await executePaperOrder({
      symbol: 'INFY',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 10,
      orderType: 'LIMIT',
      limitPrice: 1000,
    })

    // Sell 5 @ 1200 -> profit = 5 * 200 = 1000
    const sellRes = await executePaperOrder({
      symbol: 'INFY',
      exchange: 'NSE',
      side: 'SELL',
      quantity: 5,
      orderType: 'LIMIT',
      limitPrice: 1200,
    })

    expect(sellRes.success).toBe(true)
    expect(sellRes.realizedPnl).toBe(1000)
    expect(sellRes.remainingBalance).toBe(90000 + 6000) // 96000

    const portfolio = await getPaperPortfolio()
    expect(portfolio.holdings[0].quantity).toBe(5)
  })

  it('rejects SELL order when user does not hold sufficient shares', async () => {
    await expect(
      executePaperOrder({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        side: 'SELL',
        quantity: 10,
        orderType: 'LIMIT',
        limitPrice: 2800,
      })
    ).rejects.toThrow('Insufficient holdings to sell')
  })
})
