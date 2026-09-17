import { describe, it, expect, beforeEach, vi } from 'vitest'
import { zerodhaTradeTool } from './zerodhaTrade'
import { resetPaperPortfolio, getTradingConfig, saveTradingConfig } from '../trading/tradingStorage'
import { marketDataTool } from './marketData'

describe('zerodhaTrade tool', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPaperPortfolio()
    vi.spyOn(marketDataTool, 'execute').mockResolvedValue({
      success: true,
      prices: [2500],
    })
  })

  it('provides comprehensive schema and description', () => {
    expect(zerodhaTradeTool.schema).toBeDefined()
    expect(zerodhaTradeTool.schema.description).toContain('Indian stocks')
    expect(zerodhaTradeTool.schema.parameters.properties.action).toBeDefined()
  })

  it('fetches quotes for Indian stocks in paper mode', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'quote',
      symbol: 'RELIANCE',
      exchange: 'NSE',
    })

    expect(res.success).toBe(true)
    expect(res.symbol).toBe('NSE:RELIANCE')
    expect(typeof res.lastPrice).toBe('number')
    expect(res.currency).toBe('INR')
  })

  it('performs quantitative technical analysis and outputs key levels', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'analyze',
      symbol: 'TCS',
      exchange: 'NSE',
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('analyze')
    expect(typeof res.setupScore).toBe('number')
    expect(res.setupScore).toBeGreaterThanOrEqual(0)
    expect(res.setupScore).toBeLessThanOrEqual(100)
    expect(res.recommendation).toBeDefined()
    expect(res.keyLevels.stopLoss).toBeDefined()
    expect(res.keyLevels.target1).toBeDefined()
    expect(res.indicators.rsi14).toBeDefined()
  })

  it('fetches paper margins and net worth', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'margins',
    })

    expect(res.success).toBe(true)
    expect(res.mode).toBe('paper')
    expect(res.availableCash).toBe(100000)
    expect(res.totalNetWorth).toBe(100000)
  })

  it('requires confirmation ticket before placing any order', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'place_order',
      symbol: 'TCS',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 5,
      order_type: 'LIMIT',
      price: 3500,
    })

    expect(res.success).toBe(true)
    expect(res.status).toBe('PENDING_CONFIRMATION')
    expect(res.requiresConfirmation).toBe(true)
    expect(res.ticket).toBeDefined()
    expect(res.ticket.symbol).toBe('TCS')
    expect(res.ticket.side).toBe('BUY')
    expect(res.ticket.quantity).toBe(5)
  })

  it('executes order when confirmed: true is provided', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'place_order',
      symbol: 'INFY',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 10,
      order_type: 'LIMIT',
      price: 1800,
      confirmed: true,
    })

    expect(res.success).toBe(true)
    expect(res.status).toBe('EXECUTED')
    expect(res.paper).toBe(true)
    expect(res.symbol).toBe('NSE:INFY')

    // Verify in portfolio
    const pf = await zerodhaTradeTool.execute({ action: 'portfolio' })
    expect(pf.success).toBe(true)
    expect(pf.holdings.length).toBe(1)
    expect(pf.holdings[0].symbol).toBe('NSE:INFY')
  })

  it('blocks switching to live mode without valid Zerodha credentials', async () => {
    const res = await zerodhaTradeTool.execute({
      action: 'set_mode',
      mode: 'live',
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('Cannot switch to Live Trading')
  })

  it('allows switching to live mode when credentials are present', async () => {
    saveTradingConfig({
      zerodhaApiKey: 'valid_api_key',
      zerodhaAccessToken: 'valid_token',
    })

    const res = await zerodhaTradeTool.execute({
      action: 'set_mode',
      mode: 'live',
    })

    expect(res.success).toBe(true)
    expect(res.mode).toBe('live')
  })

  it('enforces risk limit on maximum single order value', async () => {
    // Default maxOrderValue is ₹2,00,000
    saveTradingConfig({
      paperBalance: 5000000,
      maxOrderValue: 50000,
    })

    const res = await zerodhaTradeTool.execute({
      action: 'place_order',
      symbol: 'MRF',
      side: 'BUY',
      quantity: 1,
      order_type: 'LIMIT',
      price: 135000, // exceeds ₹50,000
    })

    expect(res.success).toBe(false)
    expect(res.error).toContain('Risk limit exceeded')
  })
})
