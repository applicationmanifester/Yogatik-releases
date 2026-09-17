import React, { useState, useEffect } from 'react'
import { TrendingUp, Shield, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Bot, Key } from 'lucide-react'
import { Modal } from './Modal'
import { getTradingConfig, saveTradingConfig, resetPaperPortfolio } from '../trading/tradingStorage'
import { getKiteLoginUrl, generateSessionToken, extractRequestToken } from '../trading/zerodhaClient'

export function TradingModal({ isOpen, onClose }) {
  const [config, setConfig] = useState(getTradingConfig())
  const [requestToken, setRequestToken] = useState('')
  const [authStatus, setAuthStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setConfig(getTradingConfig())
      setAuthStatus(null)
      setSaveSuccess(false)

      // Auto-detect request_token from current URL if user was redirected back to Yogatik
      try {
        if (typeof window !== 'undefined' && window.location?.search) {
          const params = new URLSearchParams(window.location.search)
          const tok = params.get('request_token')
          if (tok) {
            setRequestToken(tok.trim())
            // Clean up the URL search bar cleanly without reload
            const cleanUrl = window.location.origin + window.location.pathname
            window.history.replaceState({}, document.title, cleanUrl)
          }
        }
      } catch {}
    }
  }, [isOpen])

  if (!isOpen) return null

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
    }
  }

  const isLive = config.mode === 'live'

  return (
    <Modal
      onClose={onClose}
      title="Indian Stock Trading & Zerodha Kite"
      icon={<TrendingUp size={20} style={{ color: 'var(--accent)' }} />}
      className="trading-modal"
    >
      <div style={{ padding: '8px 0 16px', color: 'var(--text-primary)' }}>
        {/* Mode Selector */}
        <div style={{
          marginBottom: '20px',
          background: 'var(--bg-tertiary)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
        }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            marginBottom: '10px'
          }}>
            Execution Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              type="button"
              onClick={() => {
                const next = saveTradingConfig({ mode: 'paper' })
                setConfig(next)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: '8px',
                border: !isLive ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: !isLive ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                color: !isLive ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Shield size={16} /> Paper Simulator
            </button>
            <button
              type="button"
              onClick={() => {
                const next = saveTradingConfig({ mode: 'live' })
                setConfig(next)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: '8px',
                border: isLive ? '2px solid var(--error, #ef4444)' : '1px solid var(--border)',
                background: isLive ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
                color: isLive ? 'var(--error, #ef4444)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <AlertTriangle size={16} /> Live Zerodha Kite
            </button>
          </div>
          <p style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '10px',
            marginBottom: 0,
            lineHeight: 1.5,
          }}>
            {!isLive
              ? 'Zero-risk mode: uses virtual funds (₹1,00,000) with real-time NSE/BSE stock quotes.'
              : 'Real money mode: transmits orders directly to your Zerodha Demat/Trading account via Kite Connect.'}
          </p>
        </div>

        {/* Zerodha Credentials */}
        <form onSubmit={handleSave}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            fontWeight: 700,
            fontSize: '14px',
            color: 'var(--text-primary)',
          }}>
            <Key size={16} style={{ color: 'var(--accent)' }} />
            <span>Zerodha Kite Connect v3 Credentials</span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Kite API Key
            </label>
            <input
              type="text"
              value={config.zerodhaApiKey || ''}
              onChange={(e) => setConfig({ ...config, zerodhaApiKey: e.target.value.trim() })}
              placeholder="e.g. your_api_key"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              Kite API Secret
            </label>
            <input
              type="password"
              value={config.zerodhaApiSecret || ''}
              onChange={(e) => setConfig({ ...config, zerodhaApiSecret: e.target.value.trim() })}
              placeholder="e.g. your_api_secret"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Daily Login Flow */}
          <div style={{
            background: 'var(--bg-tertiary)',
            padding: '14px',
            borderRadius: '10px',
            marginBottom: '18px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Daily SEBI 2FA Authentication
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={handleKiteLogin}
                style={{
                  padding: '8px 14px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                }}
              >
                1. Open Zerodha Login
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={requestToken}
                onChange={(e) => {
                  const val = e.target.value
                  setRequestToken(extractRequestToken(val))
                }}
                placeholder="Paste request_token or full redirect URL"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={handleExchangeToken}
                disabled={loading}
                style={{
                  padding: '8px 14px',
                  background: 'var(--success, #22c55e)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: loading ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? 'Validating...' : 'Generate Token'}
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
              💡 You can paste either the pure <strong>request_token</strong> or the <strong>entire redirect URL</strong> from your browser — Yogatik will automatically extract the token for you.
            </div>

            {authStatus && (
              <div style={{
                marginTop: '10px',
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: authStatus.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${authStatus.success ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)'}`,
                color: authStatus.success ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                {authStatus.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{authStatus.message}</span>
              </div>
            )}
          </div>

          {/* Risk Limits */}
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>
            Risk & Safety Limits
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                Max Value Per Trade (₹)
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
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                Virtual Paper Balance
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
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={13} /> Reset (₹1,00,000)
              </button>
            </div>
          </div>

          {/* Autonomous Profit Optimizer & Scanner */}
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <strong style={{ fontSize: '13.5px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bot size={16} /> Autonomous Market Scanner & Profit Engine
                </strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Evaluates Nifty stocks on quantitative setups (RSI, MACD, EMA, Bollinger, ATR) and executes only high-probability trades with positive expected value.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Min Score (0-100)
                </label>
                <input
                  type="number"
                  value={config.autoTrader?.minSetupScore || 75}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), minSetupScore: Number(e.target.value) || 75 },
                  })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    fontSize: '12.5px',
                    borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Take Profit (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.autoTrader?.profitTargetPercent || 3.5}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), profitTargetPercent: Number(e.target.value) || 3.5 },
                  })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    fontSize: '12.5px',
                    borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Stop Loss (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={config.autoTrader?.stopLossPercent || 2.0}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), stopLossPercent: Number(e.target.value) || 2.0 },
                  })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    fontSize: '12.5px',
                    borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14px',
            borderTop: '1px solid var(--border)',
          }}>
            {saveSuccess && (
              <span style={{ color: 'var(--success, #22c55e)', fontSize: '12.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Settings saved
              </span>
            )}
            <button
              type="submit"
              style={{
                marginLeft: 'auto',
                padding: '9px 18px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
