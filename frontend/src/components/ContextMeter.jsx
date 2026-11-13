import React, { useMemo } from 'react'
import { Activity, Zap } from 'lucide-react'
import { getModelContextLimits } from '../compaction'
import {
  estimateConversationTokens,
  formatTokenCount,
  calculateUsagePercent,
  getUsageColor,
} from '../tokenEstimator'

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

// estimateConversationTokens, formatTokenCount, calculateUsagePercent, getUsageColor
// are now re-exported from the unified tokenEstimator.js
export { estimateConversationTokens, formatTokenCount, calculateUsagePercent, getUsageColor } from '../tokenEstimator'

export function ContextMeter({
  messages = [],
  systemPrompt = '',
  input = '',
  provider = 'local',
  model = '',
  onOpenContextModal = null,
  onClick = null,
  onQuickCompact = null,
}) {
  const handleClick = onOpenContextModal || onClick

  // Memoised on the message list, not recomputed per render: this walks every
  // message and JSON.stringifies every tool result, and the component sits in
  // the header, which re-renders for reasons that have nothing to do with the
  // conversation length. `input` is folded in separately so a keystroke costs a
  // string length rather than a full pass.
  const historyTokens = useMemo(
    () => estimateConversationTokens({ messages, systemPrompt, input: '' }),
    [messages, systemPrompt],
  )
  const estimatedTokens = historyTokens + estimateConversationTokens({ messages: [], systemPrompt: '', input })
  const limit = useMemo(() => getModelContextLimit(provider, model), [provider, model])
  const percent = calculateUsagePercent(estimatedTokens, limit)

  const getColor = () => getUsageColor(percent)

  const formatTokens = formatTokenCount

  return (
    <div
      className={`context-meter-badge${handleClick ? ' clickable' : ''}`}
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      onClick={handleClick || undefined}
      onKeyDown={handleClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
      title={`Estimated Context Window: ${estimatedTokens.toLocaleString()} / ${limit.toLocaleString()} tokens (${percent}% used)${handleClick ? ' — Click to view context usage & token details' : ''}`}
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
        height: '24px',
        cursor: handleClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease'
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
      {percent >= 50 && onQuickCompact && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onQuickCompact()
          }}
          title="⚡ Quick Compact: Summarize older turns to free up tokens"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(251, 191, 36, 0.15)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '4px',
            color: '#fbbf24',
            fontSize: '10px',
            fontWeight: 700,
            padding: '1px 5px',
            cursor: 'pointer',
            marginLeft: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <Zap size={10} /> Compact
        </button>
      )}
    </div>
  )
}
