import React, { useState, useEffect } from 'react'
import { getTradingConfig, saveTradingConfig, resetPaperPortfolio } from '../trading/tradingStorage'
import { getKiteLoginUrl, generateSessionToken } from '../trading/zerodhaClient'

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
    if (!requestToken.trim()) {
      alert('Please paste the request_token from the redirected URL after logging in.')
      return
    }
    setLoading(true)
    setAuthStatus(null)
    try {
      const session = await generateSessionToken({
        apiKey: config.zerodhaApiKey,
        apiSecret: config.zerodhaApiSecret,
        requestToken: requestToken.trim(),
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--panel, #121824)',
        border: '1px solid var(--line, rgba(255,255,255,0.1))',
        borderRadius: '16px',
        maxWidth: '560px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        color: 'var(--text, #e2e8f0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span>
            <span>Indian Stock Trading & Zerodha Kite</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted, #94a3b8)',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', border: '1px solid var(--line, rgba(255,255,255,0.08))' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted, #94a3b8)', marginBottom: '8px' }}>
            Execution Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                const next = saveTradingConfig({ mode: 'paper' })
                setConfig(next)
              }}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: config.mode === 'paper' ? '2px solid var(--brand, #ff6b35)' : '1px solid var(--line, rgba(255,255,255,0.1))',
                background: config.mode === 'paper' ? 'rgba(255,107,53,0.1)' : 'transparent',
                color: config.mode === 'paper' ? 'var(--brand2, #ff9142)' : 'var(--text, #e2e8f0)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🛡️ Paper Simulator
            </button>
            <button
              type="button"
              onClick={() => {
                const next = saveTradingConfig({ mode: 'live' })
                setConfig(next)
              }}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: config.mode === 'live' ? '2px solid #ef4444' : '1px solid var(--line, rgba(255,255,255,0.1))',
                background: config.mode === 'live' ? 'rgba(239,68,68,0.1)' : 'transparent',
                color: config.mode === 'live' ? '#ef4444' : 'var(--text, #e2e8f0)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚠️ Live Zerodha Kite
            </button>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)', marginTop: '8px' }}>
            {config.mode === 'paper'
              ? 'Zero-risk mode: uses virtual funds (₹1,00,000) with real-time NSE/BSE stock quotes.'
              : 'Real money mode: transmits orders directly to your Zerodha Demat/Trading account via Kite Connect.'}
          </div>
        </div>

        {/* Zerodha Credentials */}
        <form onSubmit={handleSave}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Zerodha Kite Connect v3 Credentials</h3>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #94a3b8)', marginBottom: '4px' }}>Kite API Key</label>
            <input
              type="text"
              value={config.zerodhaApiKey || ''}
              onChange={(e) => setConfig({ ...config, zerodhaApiKey: e.target.value.trim() })}
              placeholder="e.g. your_api_key"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--line, rgba(255,255,255,0.15))',
                color: 'var(--text, #fff)',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted, #94a3b8)', marginBottom: '4px' }}>Kite API Secret</label>
            <input
              type="password"
              value={config.zerodhaApiSecret || ''}
              onChange={(e) => setConfig({ ...config, zerodhaApiSecret: e.target.value.trim() })}
              placeholder="e.g. your_api_secret"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--line, rgba(255,255,255,0.15))',
                color: 'var(--text, #fff)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Daily Login Flow */}
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--line, rgba(255,255,255,0.06))' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>Daily SEBI 2FA Authentication</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={handleKiteLogin}
                style={{
                  padding: '8px 14px',
                  background: 'var(--brand, #ff6b35)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12.5px',
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
                onChange={(e) => setRequestToken(e.target.value)}
                placeholder="Paste request_token from redirect URL"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--line, rgba(255,255,255,0.15))',
                  color: 'var(--text, #fff)',
                  fontSize: '12px',
                }}
              />
              <button
                type="button"
                onClick={handleExchangeToken}
                disabled={loading}
                style={{
                  padding: '7px 14px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Validating...' : 'Generate Token'}
              </button>
            </div>

            {authStatus && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: authStatus.success ? '#10b981' : '#ef4444' }}>
                {authStatus.message}
              </div>
            )}
          </div>

          {/* Risk Limits */}
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Risk & Safety Limits</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #94a3b8)', marginBottom: '4px' }}>Max Value Per Trade (₹)</label>
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
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--line, rgba(255,255,255,0.15))',
                  color: 'var(--text, #fff)',
                  fontSize: '12.5px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted, #94a3b8)', marginBottom: '4px' }}>Virtual Paper Balance</label>
              <button
                type="button"
                onClick={handleResetPaper}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid var(--line, rgba(255,255,255,0.2))',
                  color: 'var(--text, #fff)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Reset (₹1,00,000)
              </button>
            </div>
          </div>

          {/* Autonomous Profit Optimizer & Scanner */}
          <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#38bdf8' }}>🤖 Autonomous Market Scanner & Profit Engine</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--muted, #94a3b8)' }}>
                  Evaluates Nifty stocks on quantitative setups (RSI, MACD, EMA, Bollinger, ATR) and executes only high-probability trades with positive expected value.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', margin: '10px 0' }}>
              <div>
                <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Min Score (0-100)</label>
                <input
                  type="number"
                  value={config.autoTrader?.minSetupScore || 75}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), minSetupScore: Number(e.target.value) || 75 },
                  })}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Take Profit Target (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={config.autoTrader?.profitTargetPercent || 3.5}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), profitTargetPercent: Number(e.target.value) || 3.5 },
                  })}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Stop Loss Limit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={config.autoTrader?.stopLossPercent || 2.0}
                  onChange={(e) => setConfig({
                    ...config,
                    autoTrader: { ...(config.autoTrader || {}), stopLossPercent: Number(e.target.value) || 2.0 },
                  })}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--line, rgba(255,255,255,0.1))' }}>
            {saveSuccess && <span style={{ color: '#10b981', fontSize: '12.5px' }}>✓ Settings saved locally</span>}
            <button
              type="submit"
              style={{
                marginLeft: 'auto',
                padding: '9px 18px',
                background: 'var(--brand, #ff6b35)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
