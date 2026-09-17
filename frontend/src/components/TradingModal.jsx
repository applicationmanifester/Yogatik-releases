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

  const isLive = config.mode === 'live'
  const timerRef = useRef(null)

  // 1. Fetch live data for current mode
  const fetchLiveData = useCallback(async () => {
    setIsRefreshing(true)
    const currentConfig = getTradingConfig()
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
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // 2. Fetch Scanner setups
  const runScanner = useCallback(async () => {
    setScannerLoading(true)
    const list = DEFAULT_WATCHLIST.slice(0, 8)
    const results = []

    for (const sym of list) {
      try {
        const analysis = await analyzeStock(sym, 'NSE')
        results.push(analysis)
      } catch {
        // fallback simulated card
        results.push({
          symbol: `NSE:${sym}`,
          currentPrice: 1500,
          setupScore: 65,
          recommendation: 'HOLD / NEUTRAL',
          side: 'HOLD',
          keyLevels: { stopLoss: 1460, target1: 1560, riskRewardRatio: '1:2.0' },
          indicators: { rsi14: 52.4, ema20: 1490, ema50: 1475, macdStatus: 'BULLISH' },
          reasons: ['Testing key moving averages'],
        })
      }
    }
    setScannerResults(results)
    setScannerLoading(false)
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
    try {
      if (isLive) {
        alert('To place live trades, please confirm the order ticket in chat or use Kite directly.')
      } else {
        const res = await executePaperOrder({
          symbol: sym,
          side: action,
          quantity: qty,
          orderType: 'MARKET',
        })
        setActionNotice({ type: 'success', text: res.message })
        setActiveTab('positions')
        await fetchLiveData()
      }
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message })
    } finally {
      setActionLoading(null)
      setTimeout(() => setActionNotice(null), 4000)
    }
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
          {/* Mode Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              {isLive ? <AlertTriangle size={13} /> : <Shield size={13} />}
              {isLive ? 'Live Zerodha (Real Capital)' : 'Zero-Risk Paper Simulator'}
            </span>
            {isLive && !config.zerodhaAccessToken && (
              <span style={{ fontSize: '11px', color: 'var(--error, #ef4444)', fontWeight: 600 }}>
                ⚠️ 2FA Token Required
              </span>
            )}
          </div>

          {/* Polling & Refresh Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
              <Clock size={13} />
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
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
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

                      {/* Signal Rationale */}
                      {Array.isArray(setup.reasons) && setup.reasons.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.4 }}>
                          • {setup.reasons[0]}
                        </div>
                      )}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
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
