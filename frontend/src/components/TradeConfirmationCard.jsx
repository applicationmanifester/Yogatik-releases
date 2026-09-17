import React, { useState } from 'react'
import { zerodhaTradeTool } from '../tools/zerodhaTrade'

export function TradeConfirmationCard({ ticket, mode = 'paper', onExecuted, onCancelled }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  if (!ticket) return null

  const isBuy = (ticket.side || 'BUY').toUpperCase() === 'BUY'
  const isLive = mode === 'live'

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await zerodhaTradeTool.execute({
        action: 'place_order',
        exchange: ticket.exchange,
        symbol: ticket.symbol,
        side: ticket.side,
        quantity: ticket.quantity,
        order_type: ticket.orderType,
        product: ticket.product,
        price: ticket.estimatedPrice,
        confirmed: true,
      })

      if (res.success) {
        setResult(res)
        onExecuted?.(res)
      } else {
        setError(res.error || 'Execution failed')
      }
    } catch (err) {
      setError(err.message || 'Execution error')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={{
        marginTop: '10px',
        padding: '14px 16px',
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        borderRadius: '12px',
        color: 'var(--text, #e2e8f0)',
        fontSize: '13.5px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#10b981', marginBottom: '4px' }}>
          <span>✓</span>
          <span>Order Executed ({result.mode === 'live' ? 'Live Zerodha' : 'Paper Simulator'})</span>
        </div>
        <div>{result.message}</div>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: '12px',
      padding: '16px',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
      border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 107, 53, 0.35)'}`,
      borderRadius: '14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      fontSize: '13.5px',
      color: 'var(--text, #e2e8f0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isBuy ? '#10b981' : '#ef4444',
            fontWeight: 800,
            fontSize: '12px',
            padding: '3px 8px',
            borderRadius: '6px',
            textTransform: 'uppercase',
          }}>
            {ticket.side}
          </span>
          <strong style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>
            {ticket.exchange}:{ticket.symbol}
          </strong>
        </div>
        <span style={{
          fontSize: '11.5px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '999px',
          background: isLive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 107, 53, 0.15)',
          color: isLive ? '#ef4444' : '#ff9142',
          border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 107, 53, 0.3)'}`,
        }}>
          {isLive ? '⚠️ LIVE REAL MONEY' : '🛡️ VIRTUAL PAPER'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', margin: '12px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', textTransform: 'uppercase' }}>Quantity</div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{ticket.quantity} shares</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', textTransform: 'uppercase' }}>Est. Price</div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>₹{ticket.estimatedPrice?.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', textTransform: 'uppercase' }}>Total Value</div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: isBuy ? '#10b981' : '#f59e0b' }}>
            ₹{ticket.totalEstimatedValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--muted, #94a3b8)', marginBottom: '14px', lineHeight: 1.4 }}>
        Type: <strong>{ticket.orderType}</strong> • Product: <strong>{ticket.product}</strong>
        {isLive && ' • Orders will be routed directly to Zerodha Kite Connect.'}
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '12.5px', marginBottom: '10px', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 10px', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px',
            background: isBuy ? '#10b981' : '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Submitting...' : `Confirm & ${ticket.side}`}
        </button>
        <button
          type="button"
          onClick={() => onCancelled?.()}
          disabled={loading}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'var(--text, #e2e8f0)',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
