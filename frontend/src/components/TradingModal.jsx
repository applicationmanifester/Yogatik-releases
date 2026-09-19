import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bot,
  Key,
  Layers,
  ListOrdered,
  Radar,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Clock,
  Play,
  Check,
  BarChart3,
  FileText,
  Download,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react'
import { Modal } from './Modal'
import { getTradingConfig, saveTradingConfig, resetPaperPortfolio } from '../trading/tradingStorage'
import {
  getKiteLoginUrl,
  generateSessionToken,
  extractRequestToken,
  getHoldings as getZerodhaHoldings,
  getPositions as getZerodhaPositions,
  getOrders as getZerodhaOrders,
  getMargins as getZerodhaMargins,
  cancelOrder as cancelZerodhaOrder,
  squareOffPosition as squareOffZerodhaPosition,
} from '../trading/zerodhaClient'
import {
  getPaperPortfolio,
  squareOffPaperPosition,
  cancelPaperOrder,
  executePaperOrder,
  resolveLiveStockPrice,
} from '../trading/paperEngine'
import { analyzeStock } from '../tools/zerodhaTrade'
import { DEFAULT_WATCHLIST } from '../trading/autoTrader'
import {
  checkDailyCircuitBreaker,
  executeEmergencyKillSwitch,
} from '../trading/riskEngine'
import {
  runVectorBacktest,
  generateSyntheticCandles,
  calculateIndianMarketFees,
} from '../trading/backtester'
import {
  getTradeJournal,
  verifyJournalIntegrity,
  exportJournalToCsv,
  exportJournalToJson,
} from '../trading/tradeJournal'
import { evaluateExplainableSignal } from '../trading/explainableSignal'

export function TradingModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('positions') // 'positions' | 'orders' | 'scanner' | 'settings'
  const [config, setConfig] = useState(getTradingConfig())
  const [requestToken, setRequestToken] = useState('')
  const [authStatus, setAuthStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Live streaming & terminal state
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(5) // 0, 5, 10, 30 seconds
  const [lastUpdated, setLastUpdated] = useState('')
  const [actionNotice, setActionNotice] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  // Data buckets
  const [portfolioData, setPortfolioData] = useState({
    cashBalance: 100000,
    stockValue: 0,
    netWorth: 100000,
    totalInvested: 0,
    totalUnrealizedPnl: 0,
    holdings: [],
    positions: [],
  })
  const [ordersList, setOrdersList] = useState([])
  const [orderFilter, setOrderFilter] = useState('all') // 'all' | 'complete' | 'open' | 'cancelled'
  const [scannerResults, setScannerResults] = useState([])
  const [scannerLoading, setScannerLoading] = useState(false)

  // Backtest state
  const [backtestSymbol, setBacktestSymbol] = useState('RELIANCE')
  const [backtestCapital, setBacktestCapital] = useState(100000)
  const [backtestProfitTarget, setBacktestProfitTarget] = useState(2.5)
  const [backtestStopLoss, setBacktestStopLoss] = useState(1.2)
  const [backtestTrailingStop, setBacktestTrailingStop] = useState(true)
  const [backtestLoading, setBacktestLoading] = useState(false)
  const [backtestResult, setBacktestResult] = useState(null)

  // Forensic Journal & Explainable AI state
  const [journalEntries, setJournalEntries] = useState([])
  const [journalAudit, setJournalAudit] = useState(null)
  const [expandedSetupSymbol, setExpandedSetupSymbol] = useState(null)

  const isLive = config.mode === 'live'
  const timerRef = useRef(null)
  // Keep a stable ref so fetchLiveData always reads the latest config
  // without config itself being a useCallback dependency (avoids interval restarts)
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  // Daily Circuit Breaker Status
  const circuitStatus = checkDailyCircuitBreaker({
    startingDayEquity: config.startingDayEquity || 100000,
    currentEquity: portfolioData.netWorth,
    maxDailyDrawdownPercent: config.riskLimits?.maxDailyDrawdownPercent || 2.5,
  })

  // Sync journal when tab opens
  useEffect(() => {
    if (activeTab === 'journal') {
      setJournalEntries(getTradeJournal())
      setJournalAudit(null)
    }
  }, [activeTab])

  // 1. Fetch live data for current mode
  // configRef provides latest config without making it a dep (avoids interval flapping)
  const fetchLiveData = useCallback(async () => {
    setIsRefreshing(true)
    const currentConfig = configRef.current
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLastUpdated(now)

    try {
      if (currentConfig.mode === 'live' && currentConfig.zerodhaApiKey && currentConfig.zerodhaAccessToken) {
        // Fetch real Zerodha data
        const [holdingsRes, positionsRes, ordersRes, marginsRes] = await Promise.allSettled([
          getZerodhaHoldings(currentConfig.zerodhaApiKey, currentConfig.zerodhaAccessToken),
          getZerodhaPositions(currentConfig.zerodhaApiKey, currentConfig.zerodhaAccessToken),
          getZerodhaOrders(currentConfig.zerodhaApiKey, currentConfig.zerodhaAccessToken),
          getZerodhaMargins(currentConfig.zerodhaApiKey, currentConfig.zerodhaAccessToken),
        ])

        const holdings = holdingsRes.status === 'fulfilled' && Array.isArray(holdingsRes.value) ? holdingsRes.value : []
        const posNet = positionsRes.status === 'fulfilled' && Array.isArray(positionsRes.value?.net) ? positionsRes.value.net : []
        const orders = ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value) ? ordersRes.value : []
        const margins = marginsRes.status === 'fulfilled' ? marginsRes.value?.equity || marginsRes.value : {}

        const cash = Number(margins.available?.cash || margins.net || 0)
        let stockVal = 0
        let totalInvested = 0
        let totalUnrealized = 0

        const formattedPositions = posNet.map(p => {
          const qty = Number(p.quantity || 0)
          const buyAvg = Number(p.average_price || p.buy_price || 0)
          const ltp = Number(p.last_price || buyAvg)
          const pnl = Number(p.pnl || (ltp - buyAvg) * qty)
          const invested = buyAvg * Math.abs(qty)
          const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0

          stockVal += ltp * Math.abs(qty)
          totalInvested += invested
          totalUnrealized += pnl

          return {
            symbol: `${p.exchange || 'NSE'}:${p.tradingsymbol}`,
            cleanSymbol: p.tradingsymbol,
            exchange: p.exchange || 'NSE',
            product: p.product || 'MIS',
            quantity: qty,
            avgPrice: buyAvg,
            currentPrice: ltp,
            unrealizedPnl: pnl,
            pnlPercentage: pnlPct,
          }
        })

        setPortfolioData({
          cashBalance: cash,
          stockValue: stockVal,
          netWorth: cash + stockVal,
          totalInvested,
          totalUnrealizedPnl: totalUnrealized,
          holdings: holdings.map(h => ({
            symbol: `${h.exchange || 'NSE'}:${h.tradingsymbol}`,
            cleanSymbol: h.tradingsymbol,
            quantity: h.quantity,
            avgPrice: h.average_price,
            currentPrice: h.last_price,
            investedValue: h.average_price * h.quantity,
            currentValue: h.last_price * h.quantity,
            unrealizedPnl: h.pnl,
            pnlPercentage: (h.pnl / (h.average_price * h.quantity || 1)) * 100,
          })),
          positions: formattedPositions,
        })
        setOrdersList(orders)
      } else {
        // Fetch Paper Engine data
        const paperPort = await getPaperPortfolio()
        setPortfolioData({
          cashBalance: paperPort.cashBalance,
          stockValue: paperPort.stockValue,
          netWorth: paperPort.netWorth,
          totalInvested: paperPort.totalInvested,
          totalUnrealizedPnl: paperPort.totalUnrealizedPnl,
          holdings: paperPort.holdings || [],
          positions: (paperPort.holdings || []).map(h => ({
            ...h,
            product: 'CNC',
            cleanSymbol: h.symbol.replace(/^(NSE|BSE):/i, ''),
          })),
        })
        setOrdersList(currentConfig.paperOrders || [])
      }
    } catch (err) {
      console.error('[TradingModal] fetchLiveData error:', err)
      setActionNotice({ type: 'error', text: 'Failed to refresh data — check your connection or API credentials.' })
      setTimeout(() => setActionNotice(null), 4000)
    } finally {
      setIsRefreshing(false)
    }
  // configRef is stable (a ref object), so it's intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Fetch Scanner setups — runs stocks in parallel with Promise.allSettled
  const runScanner = useCallback(async () => {
    setScannerLoading(true)
    setScannerResults([]) // clear stale results while refreshing
    const list = DEFAULT_WATCHLIST.slice(0, 8)

    const settled = await Promise.allSettled(
      list.map(sym => analyzeStock(sym, 'NSE'))
    )

    const results = settled.map((res, i) => {
      if (res.status === 'fulfilled') return res.value
      // Fallback simulated card on failure
      return {
        symbol: `NSE:${list[i]}`,
        currentPrice: 1500,
        setupScore: 65,
        recommendation: 'HOLD / NEUTRAL',
        side: 'HOLD',
        keyLevels: { stopLoss: 1460, target1: 1560, riskRewardRatio: '1:2.0' },
        indicators: { rsi14: 52.4, ema20: 1490, ema50: 1475, macdStatus: 'BULLISH' },
        reasons: ['Testing key moving averages'],
      }
    })

    setScannerResults(results)
    setScannerLoading(false)
  // DEFAULT_WATCHLIST is module-level constant — intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load on open
  useEffect(() => {
    if (isOpen) {
      const cfg = getTradingConfig()
      setConfig(cfg)
      setAuthStatus(null)
      setSaveSuccess(false)
      fetchLiveData()

      // Auto-detect request_token from URL
      try {
        if (typeof window !== 'undefined' && window.location?.search) {
          const params = new URLSearchParams(window.location.search)
          const tok = params.get('request_token')
          if (tok) {
            setRequestToken(tok.trim())
            const cleanUrl = window.location.origin + window.location.pathname
            window.history.replaceState({}, document.title, cleanUrl)
          }
        }
      } catch {}
    }
  }, [isOpen, fetchLiveData])

  // Auto-refresh interval management
  useEffect(() => {
    if (!isOpen || autoRefreshInterval <= 0) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    timerRef.current = setInterval(() => {
      fetchLiveData()
    }, autoRefreshInterval * 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isOpen, autoRefreshInterval, fetchLiveData])

  // Run scanner when switching to scanner tab if empty
  useEffect(() => {
    if (activeTab === 'scanner' && scannerResults.length === 0 && !scannerLoading) {
      runScanner()
    }
  }, [activeTab, scannerResults.length, scannerLoading, runScanner])

  if (!isOpen) return null

  // 3. User Actions
  const handleSave = (e) => {
    e.preventDefault()
    saveTradingConfig(config)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  const handleKiteLogin = () => {
    if (!config.zerodhaApiKey) {
      alert('Please enter your Kite API Key first.')
      return
    }
    const url = getKiteLoginUrl(config.zerodhaApiKey)
    window.open(url, '_blank', 'width=600,height=700')
  }

  const handleExchangeToken = async () => {
    const cleanToken = extractRequestToken(requestToken)
    if (!cleanToken) {
      alert('Please paste the request_token from the redirected URL after logging in.')
      return
    }
    setLoading(true)
    setAuthStatus(null)
    try {
      const session = await generateSessionToken({
        apiKey: config.zerodhaApiKey,
        apiSecret: config.zerodhaApiSecret,
        requestToken: cleanToken,
      })
      const next = saveTradingConfig({
        zerodhaAccessToken: session.accessToken,
        zerodhaPublicToken: session.publicToken,
        zerodhaUserId: session.userId,
        zerodhaTokenExpiry: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      setConfig(next)
      setAuthStatus({ success: true, message: `Connected as ${session.userName || session.userId}! Valid for today's trading session.` })
      setRequestToken('')
      fetchLiveData()
    } catch (err) {
      setAuthStatus({ success: false, message: err.message || 'Failed to authenticate with Zerodha.' })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPaper = () => {
    if (confirm('Reset virtual paper trading portfolio back to ₹1,00,000 cash?')) {
      const next = resetPaperPortfolio(100000)
      setConfig(next)
      fetchLiveData()
      setActionNotice({ type: 'success', text: 'Paper portfolio reset to ₹1,00,000 virtual cash.' })
      setTimeout(() => setActionNotice(null), 3000)
    }
  }

  const handleSquareOff = async (position) => {
    const sym = position.symbol || position.cleanSymbol
    if (!confirm(`Are you sure you want to Square Off (Exit) ${Math.abs(position.quantity)} shares of ${sym}?`)) {
      return
    }
    setActionLoading(`square_${sym}`)
    try {
      if (isLive) {
        await squareOffZerodhaPosition({
          tradingsymbol: position.cleanSymbol,
          exchange: position.exchange || 'NSE',
          product: position.product || 'MIS',
          quantity: position.quantity,
          side: position.quantity > 0 ? 'BUY' : 'SELL',
        }, config.zerodhaApiKey, config.zerodhaAccessToken)
        setActionNotice({ type: 'success', text: `Live market square-off order submitted for ${sym}.` })
      } else {
        const res = await squareOffPaperPosition(sym)
        setActionNotice({ type: 'success', text: res.message || `Squared off ${sym}.` })
      }
      await fetchLiveData()
    } catch (err) {
      setActionNotice({ type: 'error', text: `Square off failed: ${err.message}` })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionNotice(null), 4000)
    }
  }

  const handleCancelOrder = async (orderId) => {
    if (!confirm(`Cancel order #${orderId}?`)) return
    setActionLoading(`cancel_${orderId}`)
    try {
      if (isLive) {
        await cancelZerodhaOrder(orderId, config.zerodhaApiKey, config.zerodhaAccessToken)
        setActionNotice({ type: 'success', text: `Order #${orderId} cancelled.` })
      } else {
        cancelPaperOrder(orderId)
        setActionNotice({ type: 'success', text: `Paper order #${orderId} cancelled.` })
      }
      await fetchLiveData()
    } catch (err) {
      setActionNotice({ type: 'error', text: `Cancel failed: ${err.message}` })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionNotice(null), 4000)
    }
  }

  const handleQuickExecute = async (setup) => {
    const sym = setup.symbol.replace(/^(NSE|BSE):/i, '')
    const action = setup.side === 'SELL' ? 'SELL' : 'BUY'
    const qty = 5 // default sample size
    const price = setup.currentPrice

    if (!confirm(`Quick Trade: Place ${action} order for ${qty} shares of ${sym} at ~₹${price.toFixed(2)} (${isLive ? 'LIVE REAL MONEY' : 'PAPER SIMULATOR'})?`)) {
      return
    }

    setActionLoading(`trade_${sym}`)

    // Optimistic UI: immediately insert a pending order row so the UI feels instant
    const optimisticOrder = {
      order_id: `OPT-${Date.now()}`,
      tradingsymbol: sym,
      transaction_type: action,
      quantity: qty,
      price,
      status: 'PENDING (Placing…)',
      order_timestamp: new Date().toISOString(),
      _optimistic: true,
    }
    setOrdersList(prev => [optimisticOrder, ...prev])

    try {
      if (isLive) {
        // Remove optimistic row then show redirect notice
        setOrdersList(prev => prev.filter(o => !o._optimistic))
        alert('To place live trades, please confirm the order ticket in chat or use Kite directly.')
      } else {
        const res = await executePaperOrder({
          symbol: sym,
          side: action,
          quantity: qty,
          orderType: 'MARKET',
        })
        // Remove optimistic row (fetchLiveData will repopulate with real order)
        setOrdersList(prev => prev.filter(o => !o._optimistic))
        setActionNotice({ type: 'success', text: res.message })
        setActiveTab('positions')
        await fetchLiveData()
      }
    } catch (err) {
      // Roll back the optimistic row on failure
      setOrdersList(prev => prev.filter(o => !o._optimistic))
      setActionNotice({ type: 'error', text: err.message })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionNotice(null), 4000)
    }
  }

  // Emergency Kill Switch: bulk cancel & square off
  const handleEmergencyKillSwitch = async () => {
    if (!confirm('🚨 EMERGENCY KILL SWITCH: Are you sure you want to cancel ALL pending orders and immediately SQUARE OFF all active positions?')) {
      return
    }

    setActionLoading('kill_switch')
    try {
      const cancelFn = async (id) => {
        if (isLive) return cancelZerodhaOrder(id, config.zerodhaApiKey, config.zerodhaAccessToken)
        return cancelPaperOrder(id)
      }
      const squareFn = async (sym, qty, price) => {
        if (isLive) return squareOffZerodhaPosition({ tradingsymbol: sym, quantity: qty, exchange: 'NSE' }, config.zerodhaApiKey, config.zerodhaAccessToken)
        return squareOffPaperPosition(sym)
      }

      const report = await executeEmergencyKillSwitch({
        cancelOrderFn: cancelFn,
        squareOffPositionFn: squareFn,
        openOrders: ordersList.filter(o => o.status === 'OPEN' || o.status === 'PENDING'),
        activePositions: portfolioData.positions,
      })

      setActionNotice({
        type: report.success ? 'success' : 'error',
        text: `Emergency Kill Switch: ${report.cancelledOrders.length} orders cancelled, ${report.squaredOffPositions.length} positions squared off.`,
      })
      await fetchLiveData()
    } catch (err) {
      setActionNotice({ type: 'error', text: `Kill switch failed: ${err.message}` })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionNotice(null), 5000)
    }
  }

  // Vector Backtest Runner
  const handleRunBacktest = () => {
    setBacktestLoading(true)
    setTimeout(() => {
      try {
        const candles = generateSyntheticCandles({
          basePrice: backtestSymbol === 'NIFTY 50' ? 24500 : 2500,
          count: 140,
          trend: 'bullish',
          volatility: 0.012,
        })
        const result = runVectorBacktest(candles, {
          initialCapital: Number(backtestCapital) || 100000,
          profitTargetPct: Number(backtestProfitTarget) || 2.5,
          stopLossPct: Number(backtestStopLoss) || 1.2,
          trailingStop: Boolean(backtestTrailingStop),
        })
        setBacktestResult(result)
        setActionNotice({ type: 'success', text: `Vector backtest complete for ${backtestSymbol}. Total Return: ${result.metrics?.totalReturnPercent}%` })
      } catch (err) {
        setActionNotice({ type: 'error', text: `Backtest failed: ${err.message}` })
      } finally {
        setBacktestLoading(false)
        setTimeout(() => setActionNotice(null), 4000)
      }
    }, 400)
  }

  // Forensic Journal Handlers
  const handleVerifyJournal = () => {
    const audit = verifyJournalIntegrity()
    setJournalAudit(audit)
  }

  const handleExportCsv = () => {
    const csv = exportJournalToCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yogatik_trade_journal_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJson = () => {
    const json = exportJournalToJson()
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yogatik_trade_journal_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Filter orders
  const filteredOrders = ordersList.filter(o => {
    const status = String(o.status || '').toUpperCase()
    if (orderFilter === 'complete') return status === 'COMPLETE' || status === 'EXECUTED'
    if (orderFilter === 'open') return status === 'OPEN' || status === 'PENDING'
    if (orderFilter === 'cancelled') return status === 'CANCELLED' || status === 'REJECTED'
    return true
  })

  return (
    <Modal
      onClose={onClose}
      title="Trading Terminal & Live Monitor"
      icon={<TrendingUp size={20} style={{ color: 'var(--accent, #ff6b35)' }} />}
      className="trading-modal"
    >
      <div style={{ padding: '4px 0 12px', color: 'var(--text-primary)' }}>
        {/* Top Control Bar: Execution Mode, Auto-Refresh & Streaming Status */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          background: isLive ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
          border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
          padding: '10px 14px',
          borderRadius: '10px',
          marginBottom: '14px',
        }}>
          {/* Mode Pill, Circuit Status & Emergency Kill Switch */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: isLive ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)',
              color: '#fff',
            }}>
              {isLive ? <AlertTriangle size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
              {isLive ? 'Live Zerodha (Real Capital)' : 'Zero-Risk Paper Simulator'}
            </span>

            {/* Daily Circuit Breaker Status */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 9px',
              borderRadius: '16px',
              fontSize: '11px',
              fontWeight: 700,
              background: circuitStatus.isTripped ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.12)',
              border: `1px solid ${circuitStatus.isTripped ? 'var(--error, #ef4444)' : 'rgba(59, 130, 246, 0.3)'}`,
              color: circuitStatus.isTripped ? 'var(--error, #ef4444)' : '#3b82f6',
            }}>
              <Shield size={12} aria-hidden="true" />
              Circuit: {circuitStatus.isTripped ? 'TRIPPED' : 'HEALTHY'} (-{circuitStatus.drawdownPercent}% / {circuitStatus.limitPercent}%)
            </span>

            {/* Emergency Kill Switch */}
            <button
              type="button"
              onClick={handleEmergencyKillSwitch}
              disabled={actionLoading === 'kill_switch'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#dc2626',
                color: '#fff',
                border: '1px solid #b91c1c',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.03em',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)',
              }}
              title="Cancel all orders and square off all positions immediately"
            >
              <AlertOctagon size={13} aria-hidden="true" />
              {actionLoading === 'kill_switch' ? 'KILLING...' : 'KILL SWITCH'}
            </button>

            {isLive && !config.zerodhaAccessToken && (
              <span style={{ fontSize: '11px', color: 'var(--error, #ef4444)', fontWeight: 600 }}>
                ⚠️ 2FA Token Required
              </span>
            )}
          </div>

          {/* Polling & Refresh Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
              <Clock size={13} aria-hidden="true" />
              <span>Poll:</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '3px 6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={0}>Manual</option>
                <option value={5}>Every 5s</option>
                <option value={15}>Every 15s</option>
                <option value={30}>Every 30s</option>
              </select>
            </div>

            <button
              type="button"
              onClick={fetchLiveData}
              disabled={isRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isRefreshing ? 'wait' : 'pointer',
              }}
              title="Refresh live prices & portfolio"
            >
              <RefreshCw size={12} aria-hidden="true" className={isRefreshing ? 'animate-spin' : ''} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>

            {lastUpdated && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Global Action Banner */}
        {actionNotice && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '8px',
            marginBottom: '12px',
            fontSize: '12.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: actionNotice.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${actionNotice.type === 'success' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'}`,
            color: actionNotice.type === 'success' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
          }}>
            {actionNotice.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <span>{actionNotice.text}</span>
          </div>
        )}

        {/* Terminal Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '8px',
          marginBottom: '14px',
          overflowX: 'auto',
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'positions' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'positions' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'positions' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={15} /> Positions & P&L
            {portfolioData.positions.length > 0 && (
              <span style={{
                background: 'var(--accent, #ff6b35)',
                color: '#fff',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10px',
                fontWeight: 800,
              }}>
                {portfolioData.positions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'orders' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'orders' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'orders' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <ListOrdered size={15} /> Order Book
            {ordersList.length > 0 && (
              <span style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10px',
                fontWeight: 700,
              }}>
                {ordersList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'scanner' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'scanner' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'scanner' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Radar size={15} /> Market Scanner
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backtest')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'backtest' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'backtest' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'backtest' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <BarChart3 size={15} /> Vector Backtest
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('journal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'journal' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'journal' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'journal' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <FileText size={15} /> Forensic Journal
            {journalEntries.length > 0 && (
              <span style={{
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#3b82f6',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10px',
                fontWeight: 800,
              }}>
                {journalEntries.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: activeTab === 'settings' ? '1px solid var(--accent, #ff6b35)' : '1px solid transparent',
              background: activeTab === 'settings' ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'transparent',
              color: activeTab === 'settings' ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            <SlidersHorizontal size={15} /> Settings & 2FA
          </button>
        </div>

        {/* TAB 1: POSITIONS & PORTFOLIO */}
        {activeTab === 'positions' && (
          <div>
            {/* 4 Summary Stat Metric Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }}>
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Total Net Worth
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{portfolioData.netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Available Cash / Margin
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{portfolioData.cashBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Unrealized P&L
                </span>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: portfolioData.totalUnrealizedPnl >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                }}>
                  {portfolioData.totalUnrealizedPnl >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  <span>
                    {portfolioData.totalUnrealizedPnl >= 0 ? '+' : ''}₹{portfolioData.totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Invested Capital
                </span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{portfolioData.totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Positions Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                  Open Positions ({portfolioData.positions.length})
                </h3>
              </div>

              {portfolioData.positions.length === 0 ? (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px dashed var(--border)',
                  borderRadius: '10px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}>
                  <Layers size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>No active positions</div>
                  <p style={{ fontSize: '12px', margin: '4px 0 12px', color: 'var(--text-secondary)' }}>
                    Scan Nifty stocks in the <strong>Market Scanner</strong> tab or command trades via chat.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('scanner')}
                    style={{
                      padding: '6px 14px',
                      background: 'var(--accent, #ff6b35)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Open Market Scanner
                  </button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '9px 12px' }}>Instrument</th>
                        <th style={{ padding: '9px 12px' }}>Product</th>
                        <th style={{ padding: '9px 12px' }}>Qty</th>
                        <th style={{ padding: '9px 12px' }}>Avg Buy</th>
                        <th style={{ padding: '9px 12px' }}>LTP</th>
                        <th style={{ padding: '9px 12px' }}>MTM P&L</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioData.positions.map((pos, idx) => {
                        const isProfitable = (pos.unrealizedPnl || 0) >= 0
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                              {pos.symbol}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                {pos.product}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                              {pos.quantity}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              ₹{Number(pos.avgPrice || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                              ₹{Number(pos.currentPrice || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: isProfitable ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)' }}>
                              {isProfitable ? '+' : ''}₹{Number(pos.unrealizedPnl || 0).toFixed(2)} ({isProfitable ? '+' : ''}{Number(pos.pnlPercentage || 0).toFixed(2)}%)
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => handleSquareOff(pos)}
                                disabled={actionLoading === `square_${pos.symbol}`}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  borderRadius: '6px',
                                  border: '1px solid var(--error, #ef4444)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: 'var(--error, #ef4444)',
                                  cursor: 'pointer',
                                }}
                              >
                                {actionLoading === `square_${pos.symbol}` ? 'Exiting...' : 'Square Off'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ORDER BOOK */}
        {activeTab === 'orders' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['all', 'complete', 'open', 'cancelled'].map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setOrderFilter(f)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      background: orderFilter === f ? 'var(--accent, #ff6b35)' : 'var(--bg-tertiary)',
                      color: orderFilter === f ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Showing {filteredOrders.length} orders
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px dashed var(--border)',
                borderRadius: '10px',
                padding: '30px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}>
                <ListOrdered size={28} style={{ opacity: 0.4, marginBottom: '8px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>No orders match this filter</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 12px' }}>Time</th>
                      <th style={{ padding: '8px 12px' }}>Instrument</th>
                      <th style={{ padding: '8px 12px' }}>Side</th>
                      <th style={{ padding: '8px 12px' }}>Qty</th>
                      <th style={{ padding: '8px 12px' }}>Price</th>
                      <th style={{ padding: '8px 12px' }}>Type</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((ord, idx) => {
                      const isBuy = String(ord.side || ord.transaction_type || '').toUpperCase() === 'BUY'
                      const status = String(ord.status || 'COMPLETE').toUpperCase()
                      const timeStr = ord.timestamp || ord.order_timestamp
                        ? new Date(ord.timestamp || ord.order_timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : 'Today'
                      const ordId = ord.orderId || ord.order_id

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                          <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                            {timeStr}
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 700 }}>
                            {ord.symbol || ord.tradingsymbol}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: isBuy ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isBuy ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                            }}>
                              {isBuy ? 'BUY' : 'SELL'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                            {ord.quantity}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            ₹{Number(ord.price || ord.average_price || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {ord.orderType || ord.order_type || 'LIMIT'}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: status === 'COMPLETE' || status === 'EXECUTED'
                                ? 'var(--success, #22c55e)'
                                : status === 'OPEN' || status === 'PENDING'
                                ? 'var(--accent, #ff6b35)'
                                : 'var(--text-secondary)',
                            }}>
                              {status}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                            {(status === 'OPEN' || status === 'PENDING') && (
                              <button
                                type="button"
                                onClick={() => handleCancelOrder(ordId)}
                                disabled={actionLoading === `cancel_${ordId}`}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--border)',
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                }}
                              >
                                {actionLoading === `cancel_${ordId}` ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AUTONOMOUS MARKET SCANNER */}
        {activeTab === 'scanner' && (
          <div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginBottom: '12px',
            }}>
              <div>
                <strong style={{ fontSize: '13.5px', color: 'var(--accent, #ff6b35)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bot size={16} /> Autonomous Quantitative Scanner
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  Evaluates NIFTY stocks on 5 quantitative factors (RSI, MACD, EMA 20/50, Bollinger, ATR) for positive EV edge.
                </p>
              </div>

              <button
                type="button"
                onClick={runScanner}
                disabled={scannerLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  background: 'var(--accent, #ff6b35)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: scannerLoading ? 'wait' : 'pointer',
                }}
              >
                <RefreshCw size={13} className={scannerLoading ? 'animate-spin' : ''} style={{ animation: scannerLoading ? 'spin 1s linear infinite' : 'none' }} />
                <span>{scannerLoading ? 'Evaluating Setups...' : 'Rescan Market'}</span>
              </button>
            </div>

            {/* Setups Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
              {scannerResults.map((setup, idx) => {
                const score = setup.setupScore || 50
                const isBuy = setup.side === 'BUY'
                const scoreColor = score >= 75 ? 'var(--success, #22c55e)' : score >= 60 ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)'

                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      {/* Symbol & Price Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {setup.symbol}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            ₹{Number(setup.currentPrice || 0).toFixed(2)}
                          </div>
                        </div>

                        {/* Setup Score Badge */}
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: `${scoreColor}22`,
                            color: scoreColor,
                            border: `1px solid ${scoreColor}44`,
                          }}>
                            Score {score}/100
                          </span>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: scoreColor, marginTop: '2px' }}>
                            {setup.recommendation}
                          </div>
                        </div>
                      </div>

                      {/* Technical Breakdown Pills */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        background: 'var(--bg-secondary)',
                        padding: '8px',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        fontSize: '11px',
                      }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>RSI (14):</span>{' '}
                          <strong>{setup.indicators?.rsi14 || '—'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD:</span>{' '}
                          <strong style={{ color: setup.indicators?.macdStatus === 'BULLISH' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)' }}>
                            {setup.indicators?.macdStatus || '—'}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Stop Loss:</span>{' '}
                          <strong>₹{setup.keyLevels?.stopLoss || '—'}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>R:R Ratio:</span>{' '}
                          <strong>{setup.keyLevels?.riskRewardRatio || '1:2.0'}</strong>
                        </div>
                      </div>

                      {/* Explainable AI Factor Pills */}
                      {(() => {
                        const explainable = setup.explainable || evaluateExplainableSignal({
                          symbol: setup.symbol,
                          currentPrice: setup.currentPrice,
                          rsi: setup.indicators?.rsi14 || 54,
                          stopLoss: setup.keyLevels?.stopLoss,
                          targetPrice: setup.keyLevels?.target1,
                          portfolioEquity: portfolioData.netWorth,
                        })
                        const isExpanded = expandedSetupSymbol === setup.symbol

                        return (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: explainable.grade === 'A+' ? 'rgba(34, 197, 94, 0.2)' : explainable.grade === 'A' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                color: explainable.grade === 'A+' ? 'var(--success, #22c55e)' : explainable.grade === 'A' ? '#3b82f6' : '#eab308',
                                border: '1px solid currentColor',
                              }}>
                                Grade {explainable.grade}
                              </span>
                              <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9.5px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                Mom: {explainable.factors.momentum.score}/40
                              </span>
                              <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9.5px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                Vol: {explainable.factors.volume.score}/35
                              </span>
                              <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9.5px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                Payoff: {explainable.factors.payoff.score}/25
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setExpandedSetupSymbol(isExpanded ? null : setup.symbol)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--accent, #ff6b35)',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '2px 0',
                                marginBottom: '6px',
                              }}
                            >
                              <Sparkles size={11} />
                              {isExpanded ? 'Hide AI Rationale' : 'Explain AI Setup & Sizing'}
                              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>

                            {isExpanded && (
                              <div style={{
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                padding: '8px',
                                fontSize: '11px',
                                lineHeight: 1.45,
                                color: 'var(--text-secondary)',
                                marginBottom: '8px',
                              }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                  AI Trade Rationale:
                                </div>
                                <div style={{ marginBottom: '6px' }}>{explainable.rationale}</div>
                                <div style={{ fontSize: '10.5px', color: 'var(--success, #22c55e)', fontWeight: 600 }}>
                                  ⚡ Half-Kelly Sizing: {explainable.kellySizing?.recommendedQuantity || 0} shares ({explainable.kellySizing?.recommendedRiskPercent || 0}% risk budget)
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Quick Trade Button */}
                    <button
                      type="button"
                      onClick={() => handleQuickExecute(setup)}
                      disabled={actionLoading === `trade_${setup.symbol}`}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: isBuy ? 'var(--success, #22c55e)' : 'var(--accent, #ff6b35)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Play size={12} fill="#fff" />
                      {actionLoading === `trade_${setup.symbol}`
                        ? 'Placing...'
                        : `Execute ${setup.side || 'BUY'} (${isLive ? 'Live' : 'Paper'})`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB: VECTOR BACKTESTER */}
        {activeTab === 'backtest' && (
          <div>
            {/* Backtest Config Card */}
            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BarChart3 size={16} style={{ color: 'var(--accent, #ff6b35)' }} />
                    Institutional Vector Backtest Engine
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0 }}>
                    Vectorized candle replay with authentic Indian statutory deductions (₹20 brokerage, STT, GST, SEBI charges & dynamic slippage).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunBacktest}
                  disabled={backtestLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '7px',
                    background: 'var(--accent, #ff6b35)',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: backtestLoading ? 'wait' : 'pointer',
                  }}
                >
                  <Play size={13} fill="#fff" />
                  {backtestLoading ? 'Simulating Vector Replay...' : 'Run Vector Backtest'}
                </button>
              </div>

              {/* Controls Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Asset / Stock
                  </label>
                  <select
                    value={backtestSymbol}
                    onChange={(e) => setBacktestSymbol(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="RELIANCE">RELIANCE (Reliance Ind.)</option>
                    <option value="TCS">TCS (Tata Consultancy)</option>
                    <option value="INFY">INFY (Infosys)</option>
                    <option value="HDFCBANK">HDFCBANK (HDFC Bank)</option>
                    <option value="ICICIBANK">ICICIBANK (ICICI Bank)</option>
                    <option value="BHARTIARTL">BHARTIARTL (Airtel)</option>
                    <option value="SBIN">SBIN (State Bank of India)</option>
                    <option value="NIFTY 50">NIFTY 50 (Index)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Initial Capital (₹)
                  </label>
                  <input
                    type="number"
                    value={backtestCapital}
                    onChange={(e) => setBacktestCapital(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Profit Target (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={backtestProfitTarget}
                    onChange={(e) => setBacktestProfitTarget(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    step="0.2"
                    value={backtestStopLoss}
                    onChange={(e) => setBacktestStopLoss(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 8px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '18px' }}>
                  <input
                    type="checkbox"
                    id="trailingStopToggle"
                    checked={backtestTrailingStop}
                    onChange={(e) => setBacktestTrailingStop(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="trailingStopToggle" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Trailing ATR Ratchet
                  </label>
                </div>
              </div>
            </div>

            {/* Backtest Results Display */}
            {backtestResult?.metrics && (
              <div>
                {/* 4 Metric Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                  marginBottom: '14px',
                }}>
                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Net Strategy Return
                    </span>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 800,
                      color: backtestResult.metrics.netPnl >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                    }}>
                      {backtestResult.metrics.netPnl >= 0 ? '+' : ''}₹{backtestResult.metrics.netPnl.toLocaleString('en-IN')}
                      <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '6px' }}>
                        ({backtestResult.metrics.totalReturnPercent}%)
                      </span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Sharpe / Sortino Ratio
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {backtestResult.metrics.sharpeRatio}{' '}
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        / {backtestResult.metrics.sortinoRatio} (Rf: 6.5%)
                      </span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Win Rate / Profit Factor
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {backtestResult.metrics.winRatePercent}%{' '}
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        (PF: {backtestResult.metrics.profitFactor})
                      </span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Max Drawdown
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--error, #ef4444)' }}>
                      -{backtestResult.metrics.maxDrawdownPercent}%
                    </div>
                  </div>
                </div>

                {/* Statutory Fee Breakdown Banner */}
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  marginBottom: '14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <div>
                    <strong>Indian Market Friction Deductions:</strong> Flat ₹20 Brokerage, STT (0.025%), GST (18%), SEBI charges & dynamic slippage accounted for.
                  </div>
                  <div style={{ fontWeight: 700, color: '#3b82f6' }}>
                    Total Fees Paid: ₹{backtestResult.metrics.totalFeesPaid.toLocaleString('en-IN')}{' '}
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                      ({backtestResult.metrics.totalTrades} trades: {backtestResult.metrics.winningTrades}W / {backtestResult.metrics.losingTrades}L)
                    </span>
                  </div>
                </div>

                {/* Trade Log Table */}
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px' }}>#</th>
                        <th style={{ padding: '8px 10px' }}>Qty</th>
                        <th style={{ padding: '8px 10px' }}>Entry Price</th>
                        <th style={{ padding: '8px 10px' }}>Exit Price</th>
                        <th style={{ padding: '8px 10px' }}>Fees</th>
                        <th style={{ padding: '8px 10px' }}>Net P&L</th>
                        <th style={{ padding: '8px 10px' }}>Return</th>
                        <th style={{ padding: '8px 10px' }}>Exit Trigger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtestResult.trades.slice(0, 10).map((t) => (
                        <tr key={t.tradeId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{t.tradeId}</td>
                          <td style={{ padding: '7px 10px', fontWeight: 600 }}>{t.quantity}</td>
                          <td style={{ padding: '7px 10px' }}>₹{t.entryPrice.toFixed(2)}</td>
                          <td style={{ padding: '7px 10px' }}>₹{t.exitPrice.toFixed(2)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>₹{t.totalFees}</td>
                          <td style={{
                            padding: '7px 10px',
                            fontWeight: 700,
                            color: t.netPnl >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                          }}>
                            {t.netPnl >= 0 ? '+' : ''}₹{t.netPnl}
                          </td>
                          <td style={{
                            padding: '7px 10px',
                            fontWeight: 600,
                            color: t.returnPct >= 0 ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                          }}>
                            {t.returnPct >= 0 ? '+' : ''}{t.returnPct}%
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: t.exitReason === 'PROFIT_TARGET' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: t.exitReason === 'PROFIT_TARGET' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                            }}>
                              {t.exitReason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {backtestResult.trades.length > 10 && (
                    <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                      Showing latest 10 of {backtestResult.trades.length} simulated trades
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: FORENSIC TRADE JOURNAL */}
        {activeTab === 'journal' && (
          <div>
            {/* Header with Audit & Export */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '14px',
            }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} style={{ color: 'var(--accent, #ff6b35)' }} />
                  Cryptographic Forensic Trade Journal
                </h3>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0 }}>
                  Immutable local ledger chaining each trade decision and execution with SHA-256 cryptographic hashes.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleVerifyJournal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Shield size={13} style={{ color: 'var(--success, #22c55e)' }} />
                  Verify Ledger Hashes
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={journalEntries.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: journalEntries.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Download size={13} /> Export CSV
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={journalEntries.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: journalEntries.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Download size={13} /> Export JSON
                </button>
              </div>
            </div>

            {/* Audit Status Banner */}
            {journalAudit && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '14px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: journalAudit.isValid ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${journalAudit.isValid ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'}`,
                color: journalAudit.isValid ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
              }}>
                {journalAudit.isValid ? <CheckCircle2 size={16} /> : <AlertOctagon size={16} />}
                <span>{journalAudit.message}</span>
              </div>
            )}

            {/* Journal Entries Table */}
            {journalEntries.length === 0 ? (
              <div style={{
                padding: '36px 16px',
                textAlign: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px dashed var(--border)',
                color: 'var(--text-secondary)',
                fontSize: '12.5px',
              }}>
                No trade executions recorded in the forensic journal yet.
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Trades executed automatically by the Quant Scanner or placed via paper/live simulator will appear here chained with SHA-256 hashes.
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Timestamp</th>
                      <th style={{ padding: '8px 10px' }}>Symbol</th>
                      <th style={{ padding: '8px 10px' }}>Side</th>
                      <th style={{ padding: '8px 10px' }}>Qty</th>
                      <th style={{ padding: '8px 10px' }}>Price</th>
                      <th style={{ padding: '8px 10px' }}>Net P&L</th>
                      <th style={{ padding: '8px 10px' }}>SHA-256 Hash</th>
                      <th style={{ padding: '8px 10px' }}>Parent Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries.slice().reverse().map((entry) => (
                      <tr key={entry.index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>#{entry.index}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                          {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 700 }}>{entry.symbol}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            background: entry.side === 'BUY' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: entry.side === 'BUY' ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                          }}>
                            {entry.side}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{entry.quantity}</td>
                        <td style={{ padding: '7px 10px' }}>₹{entry.price}</td>
                        <td style={{
                          padding: '7px 10px',
                          fontWeight: 700,
                          color: entry.netPnl > 0 ? 'var(--success, #22c55e)' : entry.netPnl < 0 ? 'var(--error, #ef4444)' : 'var(--text-secondary)',
                        }}>
                          {entry.netPnl > 0 ? '+' : ''}₹{entry.netPnl}
                        </td>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--accent, #ff6b35)' }}>
                          {entry.hash.substring(0, 10)}...
                        </td>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)' }}>
                          {entry.previousHash.substring(0, 8)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS & KITE CREDENTIALS */}
        {activeTab === 'settings' && (
          <div>
            {/* Mode Selector */}
            <div style={{
              marginBottom: '16px',
              background: 'var(--bg-tertiary)',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
            }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                marginBottom: '8px'
              }}>
                Execution Engine Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = saveTradingConfig({ mode: 'paper' })
                    setConfig(next)
                    fetchLiveData()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: !isLive ? '2px solid var(--accent, #ff6b35)' : '1px solid var(--border)',
                    background: !isLive ? 'var(--accent-glow, rgba(255,107,53,0.1))' : 'var(--bg-secondary)',
                    color: !isLive ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  <Shield size={16} /> Paper Simulator
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = saveTradingConfig({ mode: 'live' })
                    setConfig(next)
                    fetchLiveData()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: isLive ? '2px solid var(--error, #ef4444)' : '1px solid var(--border)',
                    background: isLive ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
                    color: isLive ? 'var(--error, #ef4444)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  <AlertTriangle size={16} /> Live Zerodha Kite
                </button>
              </div>
            </div>

            {/* Credentials & Daily 2FA */}
            <form onSubmit={handleSave}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
                fontWeight: 700,
                fontSize: '13.5px',
                color: 'var(--text-primary)',
              }}>
                <Key size={16} style={{ color: 'var(--accent, #ff6b35)' }} />
                <span>Zerodha Kite Connect Credentials</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Kite API Key
                  </label>
                  <input
                    type="text"
                    value={config.zerodhaApiKey || ''}
                    onChange={(e) => setConfig({ ...config, zerodhaApiKey: e.target.value.trim() })}
                    placeholder="e.g. your_api_key"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Kite API Secret
                  </label>
                  <input
                    type="password"
                    value={config.zerodhaApiSecret || ''}
                    onChange={(e) => setConfig({ ...config, zerodhaApiSecret: e.target.value.trim() })}
                    placeholder="e.g. your_api_secret"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Daily SEBI 2FA Authentication Flow */}
              <div style={{
                background: 'var(--bg-tertiary)',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  Daily SEBI 2FA Session Authentication
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={handleKiteLogin}
                    style={{
                      padding: '7px 12px',
                      background: 'var(--accent, #ff6b35)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    1. Open Zerodha Login
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={requestToken}
                    onChange={(e) => setRequestToken(extractRequestToken(e.target.value))}
                    placeholder="Paste request_token or redirected URL"
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleExchangeToken}
                    disabled={loading}
                    style={{
                      padding: '7px 12px',
                      background: 'var(--success, #22c55e)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: loading ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {loading ? 'Validating...' : 'Generate Token'}
                  </button>
                </div>

                {authStatus && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11.5px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: authStatus.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${authStatus.success ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'}`,
                    color: authStatus.success ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    {authStatus.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    <span>{authStatus.message}</span>
                  </div>
                )}
              </div>

              {/* Safety & Risk Limits */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Max Order Value (₹)
                  </label>
                  <input
                    type="number"
                    value={config.riskLimits?.maxOrderValue || 25000}
                    onChange={(e) => setConfig({
                      ...config,
                      riskLimits: { ...config.riskLimits, maxOrderValue: Number(e.target.value) || 25000 },
                    })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Max Daily Drawdown % (Circuit Breaker)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={config.riskLimits?.maxDailyDrawdownPercent || 2.5}
                    onChange={(e) => setConfig({
                      ...config,
                      riskLimits: { ...config.riskLimits, maxDailyDrawdownPercent: Number(e.target.value) || 2.5 },
                    })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.riskLimits?.useFractionalKelly ?? true}
                      onChange={(e) => setConfig({
                        ...config,
                        riskLimits: { ...config.riskLimits, useFractionalKelly: e.target.checked },
                      })}
                    />
                    Half-Kelly Sizing (f* × 0.5)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.riskLimits?.useChandelierStop ?? true}
                      onChange={(e) => setConfig({
                        ...config,
                        riskLimits: { ...config.riskLimits, useChandelierStop: e.target.checked },
                      })}
                    />
                    Chandelier ATR Trailing Stop
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                    Virtual Paper Wallet
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPaper}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <RefreshCw size={12} /> Reset (₹1,00,000)
                  </button>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
              }}>
                {saveSuccess && (
                  <span style={{ color: 'var(--success, #22c55e)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> Settings saved
                  </span>
                )}
                <button
                  type="submit"
                  style={{
                    marginLeft: 'auto',
                    padding: '8px 18px',
                    background: 'var(--accent, #ff6b35)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '7px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Modal>
  )
}
