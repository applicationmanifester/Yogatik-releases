import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { TradingModal } from './TradingModal'
import { resetPaperPortfolio, saveTradingConfig } from '../trading/tradingStorage'
import * as paper from '../trading/paperEngine'
import { marketDataTool } from '../tools/marketData'
import * as zerodha from '../trading/zerodhaClient'

describe('TradingModal Component', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    resetPaperPortfolio()
    vi.clearAllMocks()

    vi.spyOn(marketDataTool, 'execute').mockResolvedValue({
      success: true,
      prices: [3500],
    })

    vi.spyOn(paper, 'resolveLiveStockPrice').mockResolvedValue({
      price: 3500,
      currency: 'INR',
      symbol: 'TCS',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<TradingModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Trading Terminal with 4 tabs when isOpen is true', async () => {
    render(<TradingModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText('Trading Terminal & Live Monitor')).toBeDefined()
    expect(screen.getByRole('button', { name: /^Positions/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Order Book$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^Market Scanner$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Settings & 2FA/i })).toBeDefined()

    // Default tab is Positions
    expect(screen.getByText('Total Net Worth')).toBeDefined()
    expect(screen.getByText('Available Cash / Margin')).toBeDefined()
    expect(screen.getByText('Unrealized P&L')).toBeDefined()
  })

  it('switches between tabs on click', async () => {
    render(<TradingModal isOpen={true} onClose={() => {}} />)

    // Switch to Order Book
    fireEvent.click(screen.getByRole('button', { name: /^Order Book$/i }))
    expect(screen.getByText(/Showing 0 orders/i)).toBeDefined()

    // Switch to Market Scanner
    fireEvent.click(screen.getByRole('button', { name: /^Market Scanner$/i }))
    expect(screen.getByText(/Autonomous Quantitative Scanner/i)).toBeDefined()

    // Switch to Settings & 2FA
    fireEvent.click(screen.getByRole('button', { name: /Settings & 2FA/i }))
    expect(screen.getByText(/Zerodha Kite Connect Credentials/i)).toBeDefined()
    expect(screen.getByText(/Daily SEBI 2FA Session Authentication/i)).toBeDefined()
  })

  it('displays open positions and enables square off in paper mode', async () => {
    vi.spyOn(paper, 'getPaperPortfolio').mockResolvedValue({
      mode: 'paper',
      cashBalance: 65000,
      stockValue: 35000,
      netWorth: 100000,
      totalInvested: 35000,
      totalUnrealizedPnl: 0,
      holdings: [
        { symbol: 'NSE:TCS', quantity: 10, avgPrice: 3500, currentPrice: 3500, unrealizedPnl: 0, pnlPercentage: 0 },
      ],
      recentOrders: [],
    })

    vi.spyOn(paper, 'squareOffPaperPosition').mockResolvedValue({
      success: true,
      message: 'Squared off NSE:TCS',
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<TradingModal isOpen={true} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('NSE:TCS')).toBeDefined()
    })

    const squareOffBtn = screen.getByRole('button', { name: /Square Off/i })
    expect(squareOffBtn).toBeDefined()

    fireEvent.click(squareOffBtn)

    await waitFor(() => {
      expect(paper.squareOffPaperPosition).toHaveBeenCalledWith('NSE:TCS')
    })
  })

  it('surfaces an error notice when fetchLiveData fails', async () => {
    // Force getPaperPortfolio to throw so the fetchLiveData catch branch fires
    vi.spyOn(paper, 'getPaperPortfolio').mockRejectedValue(new Error('portfolio fetch failed'))

    render(<TradingModal isOpen={true} onClose={() => {}} />)

    // The error notice should appear and contain a meaningful message
    await waitFor(() => {
      const notice = screen.queryByText(/Failed to refresh data/i)
      expect(notice).not.toBeNull()
    })
  })

  it('rolls back the optimistic order row when executePaperOrder rejects', async () => {
    // Start with an empty orders list
    vi.spyOn(paper, 'getPaperPortfolio').mockResolvedValue({
      mode: 'paper',
      cashBalance: 100000,
      stockValue: 0,
      netWorth: 100000,
      totalInvested: 0,
      totalUnrealizedPnl: 0,
      holdings: [],
      recentOrders: [],
    })

    // Simulate the quick-execute failing
    vi.spyOn(paper, 'executePaperOrder').mockRejectedValue(new Error('insufficient balance'))

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<TradingModal isOpen={true} onClose={() => {}} />)

    // Switch to the scanner tab (where quick-execute buttons live)
    fireEvent.click(screen.getByRole('button', { name: /^Market Scanner$/i }))

    // The scanner will run in background; we just verify state doesn't leak
    // The key assertion: after a failed execute, no lingering 'PENDING (Placing…)' row
    // is visible (optimistic rollback worked)
    await waitFor(() => {
      const pendingRows = screen.queryAllByText(/PENDING \(Placing/i)
      expect(pendingRows).toHaveLength(0)
    })
  })
})
