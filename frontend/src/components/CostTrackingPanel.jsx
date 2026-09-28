import React, { useMemo } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart2, PieChart,
  Zap, Brain, Database, Download, RefreshCw, Info, AlertTriangle
} from 'lucide-react'
import { calculateConversationCost, formatCost, formatTokens, getAllPricing } from '../costTracking'

function renderPricingRows(allPricing) {
  const rows = []
  for (const [providerId, pricing] of Object.entries(allPricing)) {
    if (pricing.free) {
      rows.push(
        <tr key={`${providerId}-free`}>
          <td>{providerId}</td>
          <td colSpan={4}><span className="cost-free"><Zap size={12} /> Free tier</span></td>
        </tr>
      )
    }
    if (pricing.flat) {
      rows.push(
        <tr key={`${providerId}-flat`}>
          <td>{providerId}</td>
          <td colSpan={2}>All models (flat)</td>
          <td style={{ textAlign: 'right' }}>${pricing.input}</td>
          <td style={{ textAlign: 'right' }}>${pricing.output}</td>
          <td>No</td>
        </tr>
      )
    }
    if (pricing.perModel && pricing.models) {
      for (const [modelId, mp] of Object.entries(pricing.models)) {
        rows.push(
          <tr key={`${providerId}-${modelId}`}>
            <td>{providerId === 'default' ? providerId : modelId === 'default' ? providerId + ' (default)' : providerId}</td>
            <td>{modelId}</td>
            <td style={{ textAlign: 'right' }}>${mp.input}</td>
            <td style={{ textAlign: 'right' }}>${mp.output}</td>
            <td>No</td>
          </tr>
        )
      }
    }
  }
  return rows
}

export function CostTrackingPanel({ messages, provider, model, onClose }) {
  const costData = useMemo(() => calculateConversationCost(messages), [messages])
  const allPricing = useMemo(() => getAllPricing(), [])

  const currentModelPricing = useMemo(() => {
    if (!provider || !model) return null
    const providerId = typeof provider === 'string' ? provider : provider?.id || ''
    const modelId = typeof model === 'string' ? model : model?.id || model?.name || ''
    return { providerId, modelId }
  }, [provider, model])

  if (!costData.totalCost && !costData.totalTokens) {
    return (
      <div className="cost-panel-empty">
        <Zap size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
        <h3>No cost data yet</h3>
        <p>Costs appear after assistant responses with token usage</p>
      </div>
    )
  }

  return (
    <div className="cost-tracking-panel">
      {/* Summary Cards */}
      <div className="cost-summary-grid">
        <div className="cost-card total">
          <div className="cost-card-icon"><DollarSign size={24} /></div>
          <div className="cost-card-content">
            <span className="cost-card-label">Total Cost</span>
            <span className="cost-card-value">{formatCost(costData.totalCost, costData.currency)}</span>
          </div>
        </div>
        
        <div className="cost-card tokens">
          <div className="cost-card-icon"><Database size={24} /></div>
          <div className="cost-card-content">
            <span className="cost-card-label">Total Tokens</span>
            <span className="cost-card-value">{formatTokens(costData.totalTokens)}</span>
          </div>
        </div>
        
        <div className="cost-card input">
          <div className="cost-card-icon"><TrendingDown size={24} /></div>
          <div className="cost-card-content">
            <span className="cost-card-label">Input Tokens</span>
            <span className="cost-card-value">{formatTokens(costData.totalInputTokens)}</span>
          </div>
        </div>
        
        <div className="cost-card output">
          <div className="cost-card-icon"><TrendingUp size={24} /></div>
          <div className="cost-card-content">
            <span className="cost-card-label">Output Tokens</span>
            <span className="cost-card-value">{formatTokens(costData.totalOutputTokens)}</span>
          </div>
        </div>
      </div>

      {/* Current Model Pricing */}
      {currentModelPricing.providerId && (
        <div className="cost-current-model">
          <h4>Current Model: {currentModelPricing.modelId} ({currentModelPricing.providerId})</h4>
          <div className="cost-pricing-info">
            {(() => {
              const pricing = getAllPricing()[currentModelPricing.providerId]
              if (!pricing) return <span className="cost-unknown">Pricing unavailable</span>
              if (pricing.free) return <span className="cost-free"><Zap size={14} /> Free tier</span>
              if (pricing.flat) return (
                <span>
                  Input: ${pricing.input}/1M \u00B7 Output: ${pricing.output}/1M
                </span>
              )
              if (pricing.perModel && pricing.models) {
                const modelPricing = pricing.models[currentModelPricing.modelId] || pricing.models.default
                if (modelPricing) {
                  return (
                    <span>
                      Input: ${modelPricing.input}/1M \u00B7 Output: ${modelPricing.output}/1M
                    </span>
                  )
                }
              }
              return <span className="cost-unknown">Pricing varies by model</span>
            })()}
          </div>
        </div>
      )}

      {/* Breakdown by Model */}
      {costData.byModel.length > 0 && (
        <div className="cost-breakdown">
          <h4>Breakdown by Model</h4>
          <div className="cost-breakdown-table">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th style={{ textAlign: 'right' }}>Turns</th>
                  <th style={{ textAlign: 'right' }}>Input</th>
                  <th style={{ textAlign: 'right' }}>Output</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th style={{ textAlign: 'right' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {costData.byModel.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <span className="cost-model-badge">{item.providerId}</span>
                      <span className="cost-model-name">{item.modelId}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{item.turns}</td>
                    <td style={{ textAlign: 'right' }}>{formatTokens(item.inputTokens)}</td>
                    <td style={{ textAlign: 'right' }}>{formatTokens(item.outputTokens)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCost(item.cost)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {costData.totalCost > 0 ? ((item.cost / costData.totalCost) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
                <tr className="cost-total-row">
                  <td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{costData.byModel.reduce((a, b) => a + b.turns, 0)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{formatTokens(costData.totalInputTokens)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{formatTokens(costData.totalOutputTokens)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{formatCost(costData.totalCost)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>100%</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provider Pricing Comparison */}
      <details className="cost-pricing-comparison">
        <summary>Provider Pricing Comparison</summary>
        <div className="cost-pricing-table">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th style={{ textAlign: 'right' }}>Input / 1M</th>
                <th style={{ textAlign: 'right' }}>Output / 1M</th>
                <th>Free Tier</th>
              </tr>
            </thead>
            <tbody>
              {renderPricingRows(allPricing)}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export function CostBadge({ messages, compact = false }) {
  const costData = useMemo(() => calculateConversationCost(messages), [messages])
  
  if (!costData.totalCost && !costData.totalTokens) return null
  
  return (
    <div className={`cost-badge ${compact ? 'compact' : ''}`}>
      <DollarSign size={compact ? 10 : 12} />
      <span>{formatCost(costData.totalCost)}</span>
      {!compact && (
        <>
          <span className="cost-divider">|</span>
          <Database size={10} />
          <span>{formatTokens(costData.totalTokens)}</span>
        </>
      )}
    </div>
  )
}