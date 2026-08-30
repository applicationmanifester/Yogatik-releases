import React, { useMemo } from 'react'
import { Activity } from 'lucide-react'
import { getModelContextLimits } from '../compaction'

/**
 * Approximate context token capacity for the active model.
 *
 * This file used to carry its OWN table of context limits, independent of the
 * one in compaction.js that the agent actually budgets against. Two tables for
 * one fact is how this app ended up with two relay lists, two usage meters and
 * two context-limit tables — and here the consequence would be a meter telling
 * the user they had 128k of headroom while the agent was compacting at 60k.
 * One table: compaction.js owns it, because that is the one with teeth.
 */
export function getModelContextLimit(provider, model) {
  return getModelContextLimits(provider, model).estimatedMaxTokens
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
  // Memoised on the message list, not recomputed per render: this walks every
  // message and JSON.stringifies every tool result, and the component sits in
  // the header, which re-renders for reasons that have nothing to do with the
  // conversation length. `input` is folded in separately so a keystroke costs a
  // string length rather than a full pass.
  const historyTokens = useMemo(
    () => estimateConversationTokens(messages, systemPrompt, ''),
    [messages, systemPrompt],
  )
  const estimatedTokens = historyTokens + Math.ceil((input || '').length / 4)
  const limit = useMemo(() => getModelContextLimit(provider, model), [provider, model])
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
