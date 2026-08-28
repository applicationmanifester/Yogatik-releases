import React from 'react'
import { Activity, Zap, Layers, Sparkles } from 'lucide-react'

/**
 * Approximate context token capacity based on active model/provider.
 */
export function getModelContextLimit(provider, model) {
  const m = (model || '').toLowerCase()
  const p = (provider || '').toLowerCase()

  if (m.includes('gemini-1.5-pro') || m.includes('gemini-2.0') || m.includes('gemini-2.5')) return 1000000
  if (m.includes('gemini-1.5-flash')) return 1000000
  if (m.includes('claude-3') || m.includes('claude-3.5') || m.includes('claude-3-7') || m.includes('claude-sonnet')) return 200000
  if (m.includes('gpt-4o') || m.includes('o1') || m.includes('o3')) return 128000
  if (m.includes('deepseek') || m.includes('deepseek-v4') || m.includes('deepseek-r1') || m.includes('deepseek-v3')) return 128000
  if (m.includes('llama-3.3') || m.includes('llama-3.1')) return 128000
  if (m.includes('mistral') || m.includes('codestral') || m.includes('qwen')) return 64000
  if (p === 'local') return 8192
  return 64000
}

/**
 * Rough token estimation: ~4 chars per token for English text & code.
 */
export function estimateConversationTokens(messages = [], systemPrompt = '', input = '') {
  let totalChars = (systemPrompt || '').length + (input || '').length
  for (const msg of messages) {
    if (msg?.text) totalChars += msg.text.length
    if (msg?.content && typeof msg.content === 'string') totalChars += msg.content.length
    if (Array.isArray(msg?.toolResults)) {
      totalChars += JSON.stringify(msg.toolResults).length
    }
  }
  return Math.ceil(totalChars / 4)
}

export function ContextMeter({ messages = [], systemPrompt = '', input = '', provider = 'local', model = '' }) {
  const estimatedTokens = estimateConversationTokens(messages, systemPrompt, input)
  const limit = getModelContextLimit(provider, model)
  const percent = Math.min(100, Math.round((estimatedTokens / limit) * 100))

  const getColor = () => {
    if (percent > 85) return '#f87171' // red
    if (percent > 60) return '#fbbf24' // yellow
    return '#34d399' // green
  }

  const formatTokens = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
    return String(num)
  }

  return (
    <div
      className="context-meter-badge"
      title={`Estimated Context Window: ${estimatedTokens.toLocaleString()} / ${limit.toLocaleString()} tokens (${percent}% used)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-secondary, #a6adc8)',
        background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
        padding: '2px 8px',
        borderRadius: '6px',
        border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
        userSelect: 'none',
        height: '24px'
      }}
    >
      <Activity size={12} style={{ color: getColor() }} />
      <span>{formatTokens(estimatedTokens)} / {formatTokens(limit)}</span>
      <div style={{
        width: '28px',
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginLeft: '2px'
      }}>
        <div style={{
          width: `${Math.max(4, percent)}%`,
          height: '100%',
          background: getColor(),
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  )
}
